import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join, basename, normalize } from "path";
import Database from "better-sqlite3";

const DB_PATH = join(process.cwd(), "..", "data", "builder.db");
const SCRIPTS_DIR = join(process.cwd(), "..", "scripts-output");

interface Script {
  id: number;
  file_path: string;
  name: string;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const scriptId = searchParams.get("id");
    const filePath = searchParams.get("path");

    let targetPath: string;
    let fileName: string;

    if (scriptId) {
      // Option A: Fetch by script ID from database
      const db = new Database(DB_PATH, { readonly: true });
      const script = db.prepare("SELECT * FROM scripts WHERE id = ?").get(Number(scriptId)) as Script | undefined;
      db.close();

      if (!script) {
        return NextResponse.json(
          { error: "Script not found" },
          { status: 404 }
        );
      }

      targetPath = script.file_path;
      fileName = script.name.endsWith(".cs") ? script.name : `${script.name}.cs`;
    } else if (filePath) {
      // Option B: Direct file path (relative to scripts-output)
      // Normalize and validate path to prevent directory traversal
      const normalizedPath = normalize(filePath).replace(/^(\.\.[\/\\])+/, "");
      targetPath = join(SCRIPTS_DIR, normalizedPath);
      fileName = basename(normalizedPath);

      // Ensure the path is within scripts-output
      if (!targetPath.startsWith(SCRIPTS_DIR)) {
        return NextResponse.json(
          { error: "Invalid path" },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { error: "Either 'id' or 'path' parameter is required" },
        { status: 400 }
      );
    }

    // Check if file exists
    if (!existsSync(targetPath)) {
      return NextResponse.json(
        { error: "File not found" },
        { status: 404 }
      );
    }

    // Read file content
    const content = readFileSync(targetPath, "utf-8");

    // Return as downloadable file
    return new NextResponse(content, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("Download error:", error);
    return NextResponse.json(
      { error: "Failed to download file" },
      { status: 500 }
    );
  }
}
