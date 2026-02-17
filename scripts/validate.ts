import Ajv, { type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import axios from "axios";
import { backOff } from "exponential-backoff";
import { glob } from "glob";
import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

export function safeTryCatch<T>(fn: () => T): [Error | null, T | null] {
	try {
		const result = fn();
		return [null, result];
	} catch (error) {
		return [error as Error, null];
	}
}

export async function safeTryCatchAsync<T>(
	fn: () => Promise<T>,
): Promise<[Error | null, T | null]> {
	try {
		const result = await fn();
		return [null, result];
	} catch (error) {
		return [error as Error, null];
	}
}

const SCHEMA_DIR = path.join(process.cwd(), "schemas");
const SUPP_DIR = path.join(process.cwd(), "supplements");
const VOCAB_DIR = path.join(process.cwd(), "vocab");

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

// Cache for DOI validation results
const doiValidationCache = new Map<string, boolean>();

export async function loadSchema(name: string): Promise<object> {
	const schemaPath = path.join(SCHEMA_DIR, `${name}.schema.json`);
	const raw = await fs.readFile(schemaPath, "utf-8");
	return JSON.parse(raw);
}

export async function loadVocabulary(
	name: string,
	vocabDir = VOCAB_DIR,
): Promise<string[]> {
	const vocabPath = path.join(vocabDir, `${name}.yml`);
	const [readError, raw] = await safeTryCatchAsync(() =>
		fs.readFile(vocabPath, "utf-8"),
	);
	if (readError) {
		throw new Error(`Failed to load vocabulary ${name}: ${readError.message}`);
	}

	if (!raw) {
		throw new Error(`Vocabulary ${name} is empty`);
	}

	const [parseError, data] = safeTryCatch(() => YAML.parse(raw));
	if (parseError) {
		throw new Error(
			`Failed to parse vocabulary ${name}: ${parseError.message}`,
		);
	}

	if (!Array.isArray(data)) {
		throw new Error(`Vocabulary ${name} must be an array of strings`);
	}

	return data as string[];
}

export type ValidationError = {
	filePath: string;
	errors: { message: string }[];
};

function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/\s+/g, "-")
		.replace(/[^a-z0-9-]/g, "")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}

function generateExpectedFileName(data: any, claimType: string): string {
	switch (claimType) {
		case "effects":
			const studyRole = data.study_role || "unknown";
			const effect = data.effect || "unknown";
			const direction = data.direction || "unknown";
			const strength = data.strength || "unknown";
			return `${studyRole}-${effect}-${direction}-${strength}.yml`;

		case "biomarkers":
			const biomarker = data.biomarker || "unknown";
			const bioDirection = data.direction || "unknown";
			const bioStrength = data.strength || "none";
			return `${biomarker}-${bioDirection}-${bioStrength}.yml`;

		case "interactions":
			const target = slugify(data.target || "unknown");
			const dangerLevel = data.danger_level || "unknown";
			return `${target}-${dangerLevel}.yml`;

		case "formulations":
			const formulation = slugify(data.formulation || "unknown");
			if (data.change) {
				return `${formulation}-${data.change}.yml`;
			} else if (data.change_percent) {
				return `${formulation}-${data.change_percent}pct.yml`;
			}
			return `${formulation}-unknown.yml`;

		case "toxicity":
			if (data.threshold_amount) {
				return `${data.threshold_amount}mg-toxicity.yml`;
			}
			return `toxicity.yml`;

		case "cycles":
			if (data.days_on_off) {
				return `${data.days_on_off}-cycle.yml`;
			} else if (data.weeks_on_off) {
				return `${data.weeks_on_off}w-cycle.yml`;
			} else if (data.months_on_off) {
				return `${data.months_on_off}m-cycle.yml`;
			}
			const cycle = data.cycle || "unknown";
			return `${cycle}-cycle.yml`;

		case "synergies":
			const compound = slugify(data.with_compound || "unknown");
			if (data.strength) {
				return `${compound}-${data.strength}.yml`;
			} else if (data.change_percent) {
				return `${compound}-${data.change_percent}pct.yml`;
			}
			return `${compound}-unknown.yml`;

		case "addiction-withdrawal":
			const symptom = slugify(data.symptom || "unknown");
			return `${symptom}.yml`;

		default:
			return "unknown.yml";
	}
}

function validateFileName(filePath: string, data: any): string | null {
	// Extract claim type and actual filename
	const claimTypeMatch = filePath.match(/\/claims\/([^\/]+)\//);
	if (!claimTypeMatch) return null;

	const claimType = claimTypeMatch[1];
	const actualFileName = path.basename(filePath);
	const expectedFileName = generateExpectedFileName(data, claimType);

	// Handle duplicates (files ending with -2, -3, etc.)
	const baseExpected = expectedFileName.replace(".yml", "");
	const duplicatePattern = new RegExp(
		`^${baseExpected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(-\\d+)?\\.yml$`,
	);

	if (!duplicatePattern.test(actualFileName)) {
		return `Filename '${actualFileName}' does not match expected pattern '${expectedFileName}' based on content`;
	}

	return null;
}

export async function validateYAML(
	filePath: string,
	validateFn: ValidateFunction,
	validateDOI = false,
	vocabularyValidation?: { field: string; vocabulary: string[] },
): Promise<ValidationError | null> {
	const [readError, raw] = await safeTryCatchAsync(() =>
		fs.readFile(filePath, "utf-8"),
	);
	if (readError) {
		return {
			filePath,
			errors: [{ message: `Read error: ${readError.message}` }],
		};
	}

	if (!raw) {
		return {
			filePath,
			errors: [{ message: "File is empty" }],
		};
	}

	const [parseError, data] = safeTryCatch(() => YAML.parse(raw));
	if (parseError) {
		return {
			filePath,
			errors: [{ message: `Parse error: ${parseError.message}` }],
		};
	}

	const valid = validateFn(data);
	if (!valid && validateFn.errors) {
		const errors = validateFn.errors.map((err) => ({
			message: err.message ?? "Unknown schema error",
		}));
		return { filePath, errors };
	}

	if (
		vocabularyValidation &&
		typeof data === "object" &&
		data &&
		vocabularyValidation.field in data
	) {
		const fieldValue = (data as Record<string, unknown>)[
			vocabularyValidation.field
		];
		if (
			typeof fieldValue === "string" &&
			!vocabularyValidation.vocabulary.includes(fieldValue)
		) {
			return {
				filePath,
				errors: [
					{
						message: `Invalid ${vocabularyValidation.field}: '${fieldValue}' not found in vocabulary`,
					},
				],
			};
		}
	}

	// Validate slug for meta.yml files
	if (filePath.endsWith("/meta.yml") && typeof data === "object" && data && "slug" in data) {
		const slug = (data as { slug: string }).slug;
		
		// Check slug format (lowercase, alphanumeric, hyphens only)
		const validSlugPattern = /^[a-z0-9-]+$/;
		if (!validSlugPattern.test(slug)) {
			return {
				filePath,
				errors: [{ message: `Invalid slug format: '${slug}'. Slug must contain only lowercase letters, numbers, and hyphens` }],
			};
		}
		
		// Check if slug matches directory name
		const dirName = path.basename(path.dirname(filePath));
		if (slug !== dirName) {
			return {
				filePath,
				errors: [{ message: `Slug '${slug}' does not match directory name '${dirName}'` }],
			};
		}
	}

	// Validate filename matches content
	if (typeof data === "object" && data) {
		const filenameError = validateFileName(filePath, data);
		if (filenameError) {
			return {
				filePath,
				errors: [{ message: filenameError }],
			};
		}
	}

	if (validateDOI && typeof data === "object" && data && "paper" in data) {
		const doi = (data as { paper: string }).paper;
		
		// Check cache for DOI validation result
		const isValid = doiValidationCache.get(doi);
		if (isValid === false) {
			return {
				filePath,
				errors: [{ message: "DOI not found in Semantic Scholar" }],
			};
		}
		// If isValid is undefined, DOI validation was skipped (cache not populated)
		// If isValid is true, DOI is valid - continue
	}

	return null;
}

// Check for duplicate claims (same DOI + same effect/biomarker/etc)
async function checkForDuplicateClaims(supplementDir: string): Promise<ValidationError[]> {
	const duplicateErrors: ValidationError[] = [];
	const claimTypes = [
		"effects",
		"biomarkers",
		"cycles",
		"interactions",
		"formulations",
		"toxicity",
		"synergies",
		"addiction-withdrawal",
	];

	for (const claimType of claimTypes) {
		const claimFiles = await glob(`${supplementDir}/claims/${claimType}/*.yml`);
		if (claimFiles.length === 0) continue;

		// Map to store DOI + identifier combinations
		const claimMap = new Map<string, string[]>(); // key: "DOI|identifier", value: [file1, file2, ...]

		for (const filePath of claimFiles) {
			try {
				const content = await fs.readFile(filePath, "utf-8");
				const [parseError, data] = safeTryCatch(() => YAML.parse(content));
				
				if (!parseError && typeof data === "object" && data && "paper" in data) {
					const doi = (data as { paper: string }).paper;
					let identifier: string | undefined;

					// Get the main identifier based on claim type
					switch (claimType) {
						case "effects":
							identifier = (data as { effect?: string }).effect;
							break;
						case "biomarkers":
							identifier = (data as { biomarker?: string }).biomarker;
							break;
						case "interactions":
							identifier = (data as { target?: string }).target;
							break;
						case "formulations":
							identifier = (data as { formulation?: string }).formulation;
							break;
						case "synergies":
							identifier = (data as { with_compound?: string }).with_compound;
							break;
						case "addiction-withdrawal":
							identifier = (data as { symptom?: string }).symptom;
							break;
						case "cycles":
							// For cycles, create a unique identifier from the cycle pattern
							if ((data as any).days_on_off) {
								identifier = `days_${(data as any).days_on_off}`;
							} else if ((data as any).weeks_on_off) {
								identifier = `weeks_${(data as any).weeks_on_off}`;
							} else if ((data as any).months_on_off) {
								identifier = `months_${(data as any).months_on_off}`;
							} else if ((data as any).cycle) {
								identifier = (data as any).cycle;
							}
							break;
						case "toxicity":
							// For toxicity, use threshold_amount as identifier if present
							identifier = (data as any).threshold_amount ? 
								`threshold_${(data as any).threshold_amount}` : "general";
							break;
					}

					if (doi && identifier) {
						const key = `${doi}|${identifier}`;
						const existingFiles = claimMap.get(key) || [];
						existingFiles.push(filePath);
						claimMap.set(key, existingFiles);
					}
				}
			} catch {
				// Skip files that can't be read or parsed
			}
		}

		// Check for duplicates
		for (const [key, files] of claimMap.entries()) {
			if (files.length > 1) {
				const [doi, identifier] = key.split("|");
				for (const filePath of files) {
					duplicateErrors.push({
						filePath,
						errors: [{
							message: `Duplicate claim found: Same paper (${doi}) with same ${claimType.slice(0, -1)} "${identifier}". Other file(s): ${files.filter(f => f !== filePath).map(f => path.basename(f)).join(", ")}`
						}],
					});
				}
			}
		}
	}

	return duplicateErrors;
}

// Collect all DOIs from files that need validation
async function collectDOIs(files: string[]): Promise<Set<string>> {
	const dois = new Set<string>();
	
	for (const filePath of files) {
		// Only check claim files that might have DOIs
		if (!filePath.includes("/claims/")) continue;
		
		try {
			const content = await fs.readFile(filePath, "utf-8");
			const [parseError, data] = safeTryCatch(() => YAML.parse(content));
			
			if (!parseError && typeof data === "object" && data && "paper" in data) {
				const doi = (data as { paper: string }).paper;
				if (doi && typeof doi === "string") {
					dois.add(doi);
				}
			}
		} catch {
			// Skip files that can't be read or parsed
		}
	}
	
	return dois;
}

// Validate a single DOI using Crossref API
async function validateDOIWithCrossref(doi: string): Promise<boolean> {
	try {
		const response = await axios.head(`https://api.crossref.org/works/${doi}`);
		return response.status === 200;
	} catch (error: unknown) {
		const axiosError = error as { response?: { status?: number } };
		// 404 means DOI doesn't exist, any other error we'll assume DOI is valid
		return axiosError.response?.status !== 404;
	}
}

// Validate DOIs in batches using Semantic Scholar batch API with Crossref fallback
async function validateDOIsInBatch(dois: string[]): Promise<void> {
	const BATCH_SIZE = 500;
	const batches: string[][] = [];
	
	// Split DOIs into batches of 500
	for (let i = 0; i < dois.length; i += BATCH_SIZE) {
		batches.push(dois.slice(i, i + BATCH_SIZE));
	}
	
	console.log(`  🔍 Validating ${dois.length} DOIs in ${batches.length} batch(es)...`);
	
	for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
		const batch = batches[batchIndex];
		console.log(`    Batch ${batchIndex + 1}/${batches.length} (${batch.length} DOIs)`);
		
		try {
			await backOff(
				async () => {
					const response = await axios.post(
						"https://api.semanticscholar.org/graph/v1/paper/batch",
						{
							ids: batch.map(doi => `DOI:${doi}`)
						},
						{
							params: {
								fields: "paperId,title"
							},
							headers: {
								'Content-Type': 'application/json'
							}
						}
					);
					
					if (response.status !== 200) {
						throw new Error(`API returned status ${response.status}`);
					}
					
					// Process response to cache validation results
					const papers = response.data;
					
					// Collect DOIs not found in Semantic Scholar
					const notFoundInSS = [];
					for (let i = 0; i < batch.length; i++) {
						const doi = batch[i];
						const paper = papers[i];
						// If paper is null, DOI was not found
						if (paper === null) {
							notFoundInSS.push(doi);
						} else {
							doiValidationCache.set(doi, true);
						}
					}
					
					// If any DOIs weren't found in Semantic Scholar, check with Crossref
					if (notFoundInSS.length > 0) {
						console.log(`      ⚠️  ${notFoundInSS.length} DOIs not found in Semantic Scholar, checking Crossref...`);
						
						// Check each DOI with Crossref
						const crossrefPromises = notFoundInSS.map(async (doi) => {
							const isValid = await validateDOIWithCrossref(doi);
							doiValidationCache.set(doi, isValid);
							return { doi, isValid };
						});
						
						const crossrefResults = await Promise.all(crossrefPromises);
						const stillInvalid = crossrefResults.filter(r => !r.isValid);
						
						if (stillInvalid.length > 0) {
							console.log(`      ❌ ${stillInvalid.length} DOIs not found in Crossref: ${stillInvalid.slice(0, 3).map(r => r.doi).join(', ')}${stillInvalid.length > 3 ? '...' : ''}`);
						} else {
							console.log(`      ✅ All DOIs found in Crossref`);
						}
					}
				},
				{
					numOfAttempts: 3,
					startingDelay: 1000,
					timeMultiple: 2,
					retry: (error: unknown) => {
						// Retry on 429 (rate limit) or network errors
						const axiosError = error as { response?: { status?: number } };
						return axiosError.response?.status === 429 || !axiosError.response;
					},
				}
			);
		} catch (error: unknown) {
			console.error(`    ❌ Batch ${batchIndex + 1} failed, marking all DOIs as invalid`);
			// Mark all DOIs in this batch as invalid
			for (const doi of batch) {
				doiValidationCache.set(doi, false);
			}
		}
	}
}

async function runValidation(specificFiles?: string[]) {
	const failures: ValidationError[] = [];

	// Load vocabularies
	const effectsVocab = await loadVocabulary("effects");
	const biomarkersVocab = await loadVocabulary("biomarkers");

	// If specific files are provided, only validate those
	if (specificFiles && specificFiles.length > 0) {
		console.log(`Validating ${specificFiles.length} changed file(s)...`);
		
		// Pre-validate all DOIs in batch
		const dois = await collectDOIs(specificFiles);
		if (dois.size > 0) {
			await validateDOIsInBatch(Array.from(dois));
		}

		// Group files by supplement to check duplicates
		const supplementsToCheck = new Set<string>();
		for (const filePath of specificFiles) {
			const match = filePath.match(/supplements\/([^\/]+)\//);
			if (match) {
				supplementsToCheck.add(match[1]);
			}
		}

		// Check for duplicates in affected supplements
		for (const supplementName of supplementsToCheck) {
			console.log(`  🔍 Checking for duplicate claims in ${supplementName}...`);
			const supplementDir = path.join(SUPP_DIR, supplementName);
			const duplicateErrors = await checkForDuplicateClaims(supplementDir);
			if (duplicateErrors.length > 0) {
				console.log(`    ❌ Found ${duplicateErrors.length} duplicate claim(s)`);
				failures.push(...duplicateErrors);
			}
		}

		for (const filePath of specificFiles) {
			console.log(`  📄 ${path.relative(process.cwd(), filePath)}`);

			// Determine file type based on path
			if (filePath.includes("/meta.yml")) {
				const metaSchema = await loadSchema("meta");
				const validateMeta = ajv.compile(metaSchema);
				const result = await validateYAML(filePath, validateMeta, false);
				if (result) failures.push(result);
			} else if (filePath.includes("/claims/")) {
				// Extract claim type from path
				const claimTypeMatch = filePath.match(/\/claims\/([^\/]+)\//);
				if (claimTypeMatch) {
					const type = claimTypeMatch[1];
					try {
						const schema = await loadSchema(type);
						const validateFn = ajv.compile(schema);

						// Determine vocabulary validation
						let vocabularyValidation:
							| { field: string; vocabulary: string[] }
							| undefined;
						if (type === "effects") {
							vocabularyValidation = {
								field: "effect",
								vocabulary: effectsVocab,
							};
						} else if (type === "biomarkers") {
							vocabularyValidation = {
								field: "biomarker",
								vocabulary: biomarkersVocab,
							};
						}

						const result = await validateYAML(
							filePath,
							validateFn,
							true,
							vocabularyValidation,
						);
						if (result) failures.push(result);
					} catch (error) {
						failures.push({
							filePath,
							errors: [{ message: `Unknown claim type: ${type}` }],
						});
					}
				}
			}
		}
	} else {
		// Full validation by supplement
		console.log("Running full validation...");

		// Get all supplement directories
		const supplementDirs = await glob(`${SUPP_DIR}/*/`);
		const supplementNames = supplementDirs.map((dir) => path.basename(dir));

		// Load schemas
		const metaSchema = await loadSchema("meta");
		const validateMeta = ajv.compile(metaSchema);

		const claimTypes = [
			"effects",
			"biomarkers",
			"cycles",
			"interactions",
			"formulations",
			"toxicity",
			"synergies",
			"addiction-withdrawal",
		];

		// Load all schemas at once
		const schemaValidators: Record<string, ValidateFunction> = {};
		for (const type of claimTypes) {
			const schema = await loadSchema(type);
			schemaValidators[type] = ajv.compile(schema);
		}

		// Pre-validate all DOIs in batch
		const allClaimFiles = await glob(`${SUPP_DIR}/*/claims/*/*.yml`);
		const dois = await collectDOIs(allClaimFiles);
		if (dois.size > 0) {
			await validateDOIsInBatch(Array.from(dois));
		}

		// Validate each supplement
		for (const supplementName of supplementNames) {
			console.log(`\n📦 Validating ${supplementName}...`);

			// Validate meta file
			const metaFile = path.join(SUPP_DIR, supplementName, "meta.yml");
			try {
				await fs.access(metaFile);
				console.log(`  📋 meta.yml`);
				const result = await validateYAML(metaFile, validateMeta, false);
				if (result) failures.push(result);
			} catch {
				failures.push({
					filePath: metaFile,
					errors: [{ message: "meta.yml file not found" }],
				});
			}

			// Check for duplicate claims
			console.log(`  🔍 Checking for duplicate claims...`);
			const supplementDir = path.join(SUPP_DIR, supplementName);
			const duplicateErrors = await checkForDuplicateClaims(supplementDir);
			if (duplicateErrors.length > 0) {
				console.log(`    ❌ Found ${duplicateErrors.length} duplicate claim(s)`);
				failures.push(...duplicateErrors);
			}

			// Validate claims by type
			for (const type of claimTypes) {
				const claimFiles = await glob(
					`${SUPP_DIR}/${supplementName}/claims/${type}/*.yml`,
				);

				if (claimFiles.length > 0) {
					console.log(`  📄 ${type} (${claimFiles.length} files)`);

					// Determine vocabulary validation
					let vocabularyValidation:
						| { field: string; vocabulary: string[] }
						| undefined;
					if (type === "effects") {
						vocabularyValidation = {
							field: "effect",
							vocabulary: effectsVocab,
						};
					} else if (type === "biomarkers") {
						vocabularyValidation = {
							field: "biomarker",
							vocabulary: biomarkersVocab,
						};
					}

					for (let i = 0; i < claimFiles.length; i++) {
						const file = claimFiles[i];
						const fileName = path.basename(file);
						console.log(`    ${i + 1}/${claimFiles.length} ${fileName}`);

						const result = await validateYAML(
							file,
							schemaValidators[type],
							true,
							vocabularyValidation,
						);
						if (result) failures.push(result);
					}
				}
			}
		}
	}

	// Output
	if (failures.length === 0) {
		console.log("✅ All files are valid.");
	} else {
		console.error(`❌ Found ${failures.length} invalid file(s):\n`);
		for (const fail of failures) {
			console.error(`🔴 ${fail.filePath}`);
			for (const err of fail.errors) {
				console.error(`  → ${err.message}`);
			}
		}
		process.exit(1);
	}
}

// Parse command line arguments
const args = process.argv.slice(2);
const specificFiles = args.length > 0 ? args : undefined;

runValidation(specificFiles);
