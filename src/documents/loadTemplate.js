import fs from 'fs';
import path from 'path';

export function loadTemplate(templateId, templatesRoot) {
  const dir = path.join(templatesRoot, templateId);
  const templatePath = path.join(dir, 'template.html');
  const fieldsPath = path.join(dir, 'fields.json');
  const emailPath = path.join(dir, 'email.json');

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templatePath}`);
  }

  const fields = JSON.parse(fs.readFileSync(fieldsPath, 'utf8'));
  const email = JSON.parse(fs.readFileSync(emailPath, 'utf8'));

  return {
    templateId: fields.templateId ?? templateId,
    version: String(fields.version ?? '1'),
    html: fs.readFileSync(templatePath, 'utf8'),
    fieldMappings: fields.mappings,
    email,
  };
}
