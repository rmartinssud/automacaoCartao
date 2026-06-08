// Test isLikelyPersonName against "MILTON ARY MEIER"

function normalizeUpperNoAccents(value: string) {
  return value
    .normalize("NFD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

const NAME_STOP_WORDS = new Set([
  "SECÇÃO", "SEÇÃO", "CIRURGIA", "MEDICINA", "ORTOPEDIA", "PEDIATRIA",
  "NASC", "NASC.", "NASCIMENTO", "RESIDÊNCIA", "RESIDENCIA",
  "AV", "AV.", "RUA", "AVENIDA", "ESTRADA", "TRAVESSA", "RODOVIA",
  "TEL", "TEL.", "TELEFONE", "CEL", "CEL.", "FAX",
  "E-MAIL", "EMAIL", "PATRONO", "ANTECESSOR", "SAUDADO",
  "SOB", "PRESIDÊNCIA", "PRESIDENCIA", "CAD", "NÚMERO", "NUMERO",
]);

function isLikelyPersonName(name: string): boolean {
  const words = name.trim().split(/\s+/).filter(Boolean);
  console.log('  words:', words);
  if (words.length < 2) { console.log('  FAIL: < 2 words'); return false; }
  if (/\d/.test(name)) { console.log('  FAIL: has digit'); return false; }
  if (name.includes('@') || name.includes('http')) { console.log('  FAIL: has @ or http'); return false; }
  // All words must be purely alphabetic
  const nonAlpha = words.find(w => !/^[A-Za-záâãàéêíóôõúçñÁÂÃÀÉÊÍÓÔÕÚÇÑ]+$/.test(w));
  if (nonAlpha) { console.log('  FAIL: non-alpha word:', nonAlpha); return false; }
  // Must not contain a stop word
  const upper = normalizeUpperNoAccents(name);
  for (const sw of NAME_STOP_WORDS) {
    if (upper.includes(sw)) { console.log('  FAIL: contains stop word:', sw); return false; }
  }
  return true;
}

const tests = [
  "MILTON ARY MEIER",
  "MIGUEL Carlos RIELLA",
  "Residência",
  "Rua das Laranjeiras",
  "Secção de Cirurgia",
  "43",
];

for (const t of tests) {
  console.log(`\nTesting: ${JSON.stringify(t)}`);
  const result = isLikelyPersonName(t);
  console.log(`  Result: ${result}`);

  // Also test the Path 2 regex
  const path2regex = /^[AÁÂÃÀÉÊÍÓÔÕÚÇÑA-Z][A-ZÁÂÃÀÉÊÍÓÔÕÚÇÑ\s]+$/.test(t);
  console.log(`  Path2 regex match: ${path2regex}`);
}

process.exit(0);
