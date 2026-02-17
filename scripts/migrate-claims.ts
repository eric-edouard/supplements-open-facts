import { glob } from "glob";
import fs from "node:fs/promises";
import path from "node:path";

const SUPP_DIR = path.join(process.cwd(), "supplements");

const DIRECTION_MAP: Record<string, string> = {
	positive: "increase",
	negative: "decrease",
	neutral: "no-change",
};

const KIND_TO_STUDY_ROLE: Record<string, string> = {
	intended: "primary-outcome",
	neutral: "primary-outcome",
	adverse: "adverse-event",
};

async function migrateEffects() {
	const files = await glob(`${SUPP_DIR}/*/claims/effects/*.yml`);
	console.log(`\nMigrating ${files.length} effect files...`);

	for (const filePath of files) {
		let content = await fs.readFile(filePath, "utf-8");
		const dir = path.dirname(filePath);
		const oldName = path.basename(filePath);

		// Extract fields from content
		const kindMatch = content.match(/^kind:\s*(\S+)/m);
		const directionMatch = content.match(/^direction:\s*(\S+)/m);
		const effectMatch = content.match(/^effect:\s*(\S+)/m);
		const strengthMatch = content.match(/^strength:\s*(\S+)/m);

		if (!kindMatch || !directionMatch) {
			console.error(`  SKIP (missing kind/direction): ${filePath}`);
			continue;
		}

		const oldKind = kindMatch[1];
		const oldDirection = directionMatch[1];
		const effect = effectMatch?.[1] || "unknown";
		const strength = strengthMatch?.[1] || "unknown";

		const newStudyRole = KIND_TO_STUDY_ROLE[oldKind] || "primary-outcome";
		const newDirection = DIRECTION_MAP[oldDirection] || oldDirection;

		// Handle weight-management → body-fat reclassification
		let newEffect = effect;
		if (effect === "weight-management") {
			newEffect = "body-fat";
			// Also change direction: "positive" (weight managed well) → "decrease" (body fat decreased)
			content = content.replace(/^effect:\s*weight-management/m, "effect: body-fat");
			console.log(`  Reclassified weight-management → body-fat: ${oldName}`);
		}

		// Replace kind with study_role
		content = content.replace(/^kind:\s*\S+/m, `study_role: ${newStudyRole}`);

		// Replace direction value
		content = content.replace(
			/^direction:\s*\S+/m,
			`direction: ${newDirection}`,
		);

		// Write updated content
		await fs.writeFile(filePath, content, "utf-8");

		// Compute new filename
		// Old: {kind}-{effect}-{direction}-{strength}.yml (possibly with -N suffix)
		// New: {study_role}-{effect}-{direction}-{strength}.yml (possibly with -N suffix)
		const suffixMatch = oldName.match(/-(\d+)\.yml$/);
		const suffix = suffixMatch ? `-${suffixMatch[1]}` : "";
		const newName = `${newStudyRole}-${newEffect}-${newDirection}-${strength}${suffix}.yml`;

		if (newName !== oldName) {
			const newPath = path.join(dir, newName);
			await fs.rename(filePath, newPath);
			console.log(`  ${oldName} → ${newName}`);
		}
	}
}

async function migrateBiomarkers() {
	const files = await glob(`${SUPP_DIR}/*/claims/biomarkers/*.yml`);
	console.log(`\nMigrating ${files.length} biomarker files...`);

	for (const filePath of files) {
		let content = await fs.readFile(filePath, "utf-8");
		const dir = path.dirname(filePath);
		const oldName = path.basename(filePath);

		const directionMatch = content.match(/^direction:\s*(\S+)/m);
		if (!directionMatch) {
			console.error(`  SKIP (missing direction): ${filePath}`);
			continue;
		}

		const oldDirection = directionMatch[1];
		const newDirection = DIRECTION_MAP[oldDirection] || oldDirection;

		// Replace direction value
		content = content.replace(
			/^direction:\s*\S+/m,
			`direction: ${newDirection}`,
		);

		await fs.writeFile(filePath, content, "utf-8");

		// Rename: replace old direction in filename with new direction
		// Pattern: {biomarker}-{direction}-{strength}.yml (possibly with -N suffix)
		const newName = oldName.replace(
			new RegExp(`-${oldDirection}-(strong|moderate|weak|none)`),
			`-${newDirection}-$1`,
		);

		if (newName !== oldName) {
			const newPath = path.join(dir, newName);
			await fs.rename(filePath, newPath);
			console.log(`  ${oldName} → ${newName}`);
		}
	}
}

async function main() {
	console.log("Starting claims migration...");
	await migrateEffects();
	await migrateBiomarkers();
	console.log("\nMigration complete!");
}

main().catch(console.error);
