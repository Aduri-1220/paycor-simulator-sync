import fs from 'fs';
import path from 'path';
import { hashFile } from './hashContent.js';

export function buildDocumentPath(documentsDir, requestId, templateId, version) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${templateId}-v${version}-${timestamp}.pdf`;
  const dir = path.join(documentsDir, requestId);
  return { dir, filename, absolutePath: path.join(dir, filename) };
}

export function storeDocument({
  documentsDir,
  requestId,
  templateId,
  templateVersion,
  pdfBuffer,
}) {
  const { dir, filename, absolutePath } = buildDocumentPath(
    documentsDir,
    requestId,
    templateId,
    templateVersion
  );

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(absolutePath, pdfBuffer);
  const sha256 = hashFile(pdfBuffer);
  const byteSize = pdfBuffer.length;

  return {
    filePath: absolutePath,
    relativePath: path.relative(process.cwd(), absolutePath),
    sha256,
    byteSize,
    filename,
  };
}
