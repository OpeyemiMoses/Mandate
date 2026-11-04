/**
 * Backup Integrity Service (Milestone 9.4)
 * Validates SQLite magic byte headers, verifies SHA-256 checksums,
 * and detects corrupted or tampered backup files without performing live restoration.
 */

import fs from "fs";
import crypto from "crypto";

const SQLITE_HEADER_MAGIC = "SQLite format 3\0";

export class BackupIntegrityService {
  /**
   * Computes the SHA-256 hash of a backup file.
   */
  public static async computeFileChecksum(filePath: string): Promise<string> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Backup file not found at ${filePath}`);
    }

    return new Promise((resolve, reject) => {
      const hash = crypto.createHash("sha256");
      const stream = fs.createReadStream(filePath);
      stream.on("data", (chunk) => hash.update(chunk));
      stream.on("end", () => resolve(hash.digest("hex")));
      stream.on("error", (err) => reject(err));
    });
  }

  /**
   * Verifies the SQLite magic header bytes and file size sanity.
   */
  public static verifySqliteHeader(filePath: string): boolean {
    if (!fs.existsSync(filePath)) return false;
    const stat = fs.statSync(filePath);
    if (stat.size < 100) return false;

    const buffer = Buffer.alloc(16);
    const fd = fs.openSync(filePath, "r");
    fs.readSync(fd, buffer, 0, 16, 0);
    fs.closeSync(fd);

    return buffer.toString("utf8") === SQLITE_HEADER_MAGIC;
  }

  /**
   * Validates a backup file against its recorded checksum and header format.
   */
  public static async verifyBackupIntegrity(
    filePath: string,
    expectedChecksum: string
  ): Promise<{ valid: boolean; actualChecksum: string; error?: string }> {
    try {
      if (!fs.existsSync(filePath)) {
        return { valid: false, actualChecksum: "", error: "File does not exist" };
      }

      // 1. Verify SQLite Header Magic Bytes
      const hasValidHeader = this.verifySqliteHeader(filePath);
      if (!hasValidHeader) {
        return {
          valid: false,
          actualChecksum: "",
          error: "Corrupted SQLite format: Missing or invalid 'SQLite format 3' magic header",
        };
      }

      // 2. Verify SHA-256 Checksum
      const actualChecksum = await this.computeFileChecksum(filePath);
      if (actualChecksum !== expectedChecksum) {
        return {
          valid: false,
          actualChecksum,
          error: `Checksum mismatch: expected ${expectedChecksum}, got ${actualChecksum}`,
        };
      }

      return { valid: true, actualChecksum };
    } catch (err: any) {
      return { valid: false, actualChecksum: "", error: err.message };
    }
  }
}

