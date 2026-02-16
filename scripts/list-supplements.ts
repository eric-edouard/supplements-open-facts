import fs from "node:fs/promises";
import path from "node:path";

const SUPPLEMENTS_DIR = path.join(process.cwd(), "supplements");

async function listSupplements(mode: "slug" | "name") {
	try {
		const items = await fs.readdir(SUPPLEMENTS_DIR, { withFileTypes: true });
		const slugs = items
			.filter((dirent) => dirent.isDirectory())
			.map((dirent) => dirent.name);

		for (const slug of slugs) {
			if (mode === "slug") {
				console.log(slug);
			} else {
				try {
					const metaPath = path.join(SUPPLEMENTS_DIR, slug, "meta.yml");
					const meta = await fs.readFile(metaPath, "utf-8");
					const match = meta.match(/^name:\s*(.+)$/m);
					console.log(match?.[1] || `(missing name) [${slug}]`);
				} catch {
					console.log(`(missing meta.yml) [${slug}]`);
				}
			}
		}
	} catch (err) {
		console.error("❌ Failed to list supplements:", err);
	}
}

const modeArg = process.argv.find((arg) => arg === "--name") ? "name" : "slug";
listSupplements(modeArg);
