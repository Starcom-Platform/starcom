import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import Ajv from 'ajv';

const ROOT = process.cwd();
const ROLE_DIR = path.join(ROOT, 'src', 'data', 'rlshRoles');
const SCHEMA_PATH = path.join(ROLE_DIR, 'role-record.schema.json');

const ROLE_FILES = [
  { fileName: 'heroes.json', role: 'hero' },
  { fileName: 'zone-guardians.json', role: 'zone_guardian' },
  { fileName: 'rescue-rangers.json', role: 'rescue_ranger' },
  { fileName: 'archangel-knights.json', role: 'archangel_knight' }
];

const readJson = (filePath) => {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
};

const loadSchemaValidator = () => {
  const schema = readJson(SCHEMA_PATH);
  const ajv = new Ajv({ allErrors: true, strict: false });
  return ajv.compile(schema);
};

const validateRoleFiles = () => {
  const validate = loadSchemaValidator();
  const errors = [];

  ROLE_FILES.forEach(({ fileName, role }) => {
    const filePath = path.join(ROLE_DIR, fileName);
    if (!fs.existsSync(filePath)) {
      errors.push(`[${fileName}] missing file`);
      return;
    }

    const data = readJson(filePath);
    if (!Array.isArray(data)) {
      errors.push(`[${fileName}] expected array root`);
      return;
    }

    data.forEach((record, index) => {
      const valid = validate(record);
      if (!valid) {
        const details = (validate.errors || [])
          .map((entry) => `${entry.instancePath || '/'} ${entry.message || 'invalid'}`)
          .join('; ');
        errors.push(`[${fileName}] record ${index}: ${details}`);
      }

      if (record && typeof record === 'object' && !Object.prototype.hasOwnProperty.call(record, 'id')) {
        errors.push(`[${fileName}] record ${index}: missing id`);
      }

      if (record && typeof record === 'object' && !Object.prototype.hasOwnProperty.call(record, 'approved')) {
        errors.push(`[${fileName}] record ${index}: missing approved`);
      }

      if (record && typeof record === 'object' && !Object.prototype.hasOwnProperty.call(record, 'reviewedBy')) {
        errors.push(`[${fileName}] record ${index}: missing reviewedBy`);
      }

      if (record && typeof record === 'object' && !Object.prototype.hasOwnProperty.call(record, 'reviewedAt')) {
        errors.push(`[${fileName}] record ${index}: missing reviewedAt`);
      }

      if (record && typeof record === 'object' && Object.prototype.hasOwnProperty.call(record, 'role')) {
        errors.push(`[${fileName}] record ${index}: role field must not exist in file; role is inferred as '${role}' from filename`);
      }
    });
  });

  if (errors.length > 0) {
    console.error('RLSH role file validation failed:');
    errors.forEach((entry) => console.error(` - ${entry}`));
    process.exit(1);
  }

  console.log('RLSH role file validation passed.');
};

validateRoleFiles();
