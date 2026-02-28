import axios, { type AxiosResponse } from "axios";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	loadSchema,
	loadVocabulary,
	safeTryCatch,
	safeTryCatchAsync,
	validateYAML,
} from "../scripts/validate";

// Mock axios
vi.mock("axios");

describe("safeTryCatch utilities", () => {
	describe("safeTryCatch", () => {
		it("should return result on success", () => {
			const [error, result] = safeTryCatch(() => "success");
			expect(error).toBeNull();
			expect(result).toBe("success");
		});

		it("should return error on failure", () => {
			const [error, result] = safeTryCatch(() => {
				throw new Error("test error");
			});
			expect(error).toBeInstanceOf(Error);
			expect(error?.message).toBe("test error");
			expect(result).toBeNull();
		});
	});

	describe("safeTryCatchAsync", () => {
		it("should return result on success", async () => {
			const [error, result] = await safeTryCatchAsync(
				async () => "async success",
			);
			expect(error).toBeNull();
			expect(result).toBe("async success");
		});

		it("should return error on failure", async () => {
			const [error, result] = await safeTryCatchAsync(async () => {
				throw new Error("async test error");
			});
			expect(error).toBeInstanceOf(Error);
			expect(error?.message).toBe("async test error");
			expect(result).toBeNull();
		});
	});
});

describe("paper_quotes validation", () => {
	const Ajv = require("ajv");
	const addFormats = require("ajv-formats");

	const testFixturesDir = path.join(process.cwd(), "test", "fixtures");
	const testVocabDir = path.join(process.cwd(), "test", "fixtures");

	const ajv = new Ajv({ allErrors: true, strict: false });
	addFormats(ajv);

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should validate effect claim with paper_quotes", async () => {
		// Mock successful DOI check
		vi.mocked(axios.head).mockResolvedValue({ status: 200 } as AxiosResponse);

		const effectsVocab = await loadVocabulary(
			"test-effects-vocab",
			testVocabDir,
		);
		const schema = await loadSchema("effects");
		const validateFn = ajv.compile(schema);
		const filePath = path.join(testFixturesDir, "valid-effect-with-quotes.yml");

		const result = await validateYAML(filePath, validateFn, true, {
			field: "effect",
			vocabulary: effectsVocab,
		});

		expect(result).toBeNull();
	});

	it("should validate biomarker claim with paper_quotes", async () => {
		// Mock successful DOI check
		vi.mocked(axios.head).mockResolvedValue({ status: 200 } as AxiosResponse);

		const biomarkersVocab = await loadVocabulary(
			"test-biomarkers-vocab",
			testVocabDir,
		);
		const schema = await loadSchema("biomarkers");
		const validateFn = ajv.compile(schema);
		const filePath = path.join(testFixturesDir, "valid-biomarker-with-quotes.yml");

		const result = await validateYAML(filePath, validateFn, true, {
			field: "biomarker",
			vocabulary: biomarkersVocab,
		});

		expect(result).toBeNull();
	});

	it("should accept claims without paper_quotes (optional field)", async () => {
		// Mock successful DOI check
		vi.mocked(axios.head).mockResolvedValue({ status: 200 } as AxiosResponse);

		const effectsVocab = await loadVocabulary(
			"test-effects-vocab",
			testVocabDir,
		);
		const schema = await loadSchema("effects");
		const validateFn = ajv.compile(schema);
		const filePath = path.join(testFixturesDir, "valid-effect.yml");

		const result = await validateYAML(filePath, validateFn, true, {
			field: "effect",
			vocabulary: effectsVocab,
		});

		expect(result).toBeNull();
	});
});

describe("loadVocabulary", () => {
	const testVocabDir = path.join(process.cwd(), "test", "fixtures");

	it("should load valid vocabulary file", async () => {
		const vocab = await loadVocabulary("test-effects-vocab", testVocabDir);
		expect(vocab).toEqual(["muscle-strength", "endurance", "memory-formation"]);
	});

	it("should load biomarkers vocabulary file", async () => {
		const vocab = await loadVocabulary("test-biomarkers-vocab", testVocabDir);
		expect(vocab).toEqual(["testosterone", "creatine-phosphate", "cortisol"]);
	});

	it("should throw error for non-existent file", async () => {
		await expect(loadVocabulary("non-existent", testVocabDir)).rejects.toThrow(
			"Failed to load vocabulary",
		);
	});
});

describe("date format validation", () => {
	const Ajv = require("ajv");
	const addFormats = require("ajv-formats");

	const testFixturesDir = path.join(process.cwd(), "test", "fixtures");

	const ajv = new Ajv({ allErrors: true, strict: false });
	addFormats(ajv);

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should reject DD-MM-YYYY date format", async () => {
		const schema = await loadSchema("effects");
		const validateFn = ajv.compile(schema);
		const filePath = path.join(testFixturesDir, "invalid-date-effect.yml");

		const result = await validateYAML(filePath, validateFn, false);

		expect(result).not.toBeNull();
		expect(result?.errors[0].message).toContain("pattern");
	});

	it("should accept ISO 8601 (YYYY-MM-DD) date format", async () => {
		vi.mocked(axios.head).mockResolvedValue({ status: 200 } as AxiosResponse);

		const effectsVocab = await loadVocabulary(
			"test-effects-vocab",
			path.join(process.cwd(), "test", "fixtures"),
		);
		const schema = await loadSchema("effects");
		const validateFn = ajv.compile(schema);
		const filePath = path.join(testFixturesDir, "valid-effect.yml");

		const result = await validateYAML(filePath, validateFn, true, {
			field: "effect",
			vocabulary: effectsVocab,
		});

		expect(result).toBeNull();
	});
});

describe("vocabulary validation integration", () => {
	const Ajv = require("ajv");
	const addFormats = require("ajv-formats");

	const testFixturesDir = path.join(process.cwd(), "test", "fixtures");
	const testVocabDir = path.join(process.cwd(), "test", "fixtures");

	const ajv = new Ajv({ allErrors: true, strict: false });
	addFormats(ajv);

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should validate file with correct effect vocabulary", async () => {
		// Mock successful DOI check
		vi.mocked(axios.head).mockResolvedValue({ status: 200 } as AxiosResponse);

		const effectsVocab = await loadVocabulary(
			"test-effects-vocab",
			testVocabDir,
		);
		const schema = await loadSchema("effects");
		const validateFn = ajv.compile(schema);
		const filePath = path.join(testFixturesDir, "valid-effect.yml");

		const result = await validateYAML(filePath, validateFn, true, {
			field: "effect",
			vocabulary: effectsVocab,
		});

		expect(result).toBeNull();
	});

	it("should reject file with invalid effect vocabulary", async () => {
		const effectsVocab = await loadVocabulary(
			"test-effects-vocab",
			testVocabDir,
		);
		const schema = await loadSchema("effects");
		const validateFn = ajv.compile(schema);
		const filePath = path.join(testFixturesDir, "invalid-effect.yml");

		const result = await validateYAML(
			filePath,
			validateFn,
			false, // Skip DOI validation for this test
			{ field: "effect", vocabulary: effectsVocab },
		);

		expect(result).not.toBeNull();
		expect(result?.errors[0].message).toContain(
			"Invalid effect: 'invalid-effect-name' not found in vocabulary",
		);
	});
});
