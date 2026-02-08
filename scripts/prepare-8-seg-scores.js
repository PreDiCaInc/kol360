#!/usr/bin/env node
/**
 * Script to prepare 8-seg-scores.xlsx for database import
 *
 * Cleanup tasks:
 * 1. Clean specialty field to only contain MD, OD, or DO
 * 2. Map Excel column names to database field names
 *
 * Usage: node scripts/prepare-8-seg-scores.js
 * Output: func-spec/8-seg-scores-cleaned.csv
 */

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// Column mapping: Excel -> Database
const COLUMN_MAP = {
  'NPI': 'npi',
  'Last': 'lastName',
  'First': 'firstName',
  'Speciality': 'specialty', // Note: Excel has typo "Speciality"
  'Peer-Reviewed Publication Score': 'scorePublications',
  'Trade Publication Score': 'scoreTradePubs',
  'Organizational Leadership Score': 'scoreOrgLeadership',
  'Organizational Awards Score': 'scoreOrgAwards',
  'Clinical Trial Score': 'scoreClinicalTrials',
  'Conference Educator Score': 'scoreConference',
  'Social Media Score': 'scoreSocialMedia',
  'Media (Podcasts/Blogs) Score': 'scoreMediaPodcasts',
};

/**
 * Clean specialty to extract only MD, OD, or DO
 * @param {string} specialty - Raw specialty value
 * @returns {{ cleaned: string | null, original: string, warning: string | null }}
 */
function cleanSpecialty(specialty) {
  if (!specialty || typeof specialty !== 'string') {
    return { cleaned: null, original: specialty || '', warning: 'Empty specialty' };
  }

  const original = specialty.trim();

  // Normalize: remove periods, convert to uppercase for matching
  const normalized = original.replace(/\./g, '').toUpperCase();

  // Look for MD, OD, or DO at word boundaries
  // Order matters - check for exact matches first, then look for embedded ones

  // Check for standalone MD, OD, DO (with commas or spaces as separators)
  const parts = normalized.split(/[\s,]+/);

  for (const part of parts) {
    if (part === 'MD') return { cleaned: 'MD', original, warning: null };
    if (part === 'OD') return { cleaned: 'OD', original, warning: null };
    if (part === 'DO') return { cleaned: 'DO', original, warning: null };
  }

  // If no match found, return warning
  return {
    cleaned: null,
    original,
    warning: `No valid degree (MD/OD/DO) found in: "${original}"`
  };
}

/**
 * Map row from Excel columns to database columns
 */
function mapRow(excelRow) {
  const dbRow = {};

  for (const [excelCol, dbCol] of Object.entries(COLUMN_MAP)) {
    let value = excelRow[excelCol];

    // Handle specialty cleaning
    if (excelCol === 'Speciality') {
      const result = cleanSpecialty(value);
      dbRow[dbCol] = result.cleaned;
      dbRow['_originalSpecialty'] = result.original;
      if (result.warning) {
        dbRow['_warning'] = result.warning;
      }
    } else {
      dbRow[dbCol] = value;
    }
  }

  return dbRow;
}

// Main execution
const inputPath = path.join(__dirname, '../func-spec/8-seg-scores.xlsx');
const outputPath = path.join(__dirname, '../func-spec/8-seg-scores-cleaned.csv');
const warningsPath = path.join(__dirname, '../func-spec/8-seg-scores-warnings.csv');

console.log('Reading Excel file...');
const workbook = XLSX.readFile(inputPath);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet);

console.log(`Found ${data.length} rows`);

// Process all rows
const cleanedData = [];
const warnings = [];
const stats = { MD: 0, OD: 0, DO: 0, null: 0 };

for (const row of data) {
  const mapped = mapRow(row);

  // Track stats
  if (mapped.specialty) {
    stats[mapped.specialty]++;
  } else {
    stats.null++;
  }

  // Collect warnings
  if (mapped._warning) {
    warnings.push({
      npi: mapped.npi,
      firstName: mapped.firstName,
      lastName: mapped.lastName,
      originalSpecialty: mapped._originalSpecialty,
      warning: mapped._warning,
    });
  }

  // Remove internal fields before output
  delete mapped._originalSpecialty;
  delete mapped._warning;

  cleanedData.push(mapped);
}

// Write cleaned data
console.log('\nWriting cleaned CSV...');
const cleanedHeaders = Object.values(COLUMN_MAP);
const csvContent = [
  cleanedHeaders.join(','),
  ...cleanedData.map(row =>
    cleanedHeaders.map(h => {
      const val = row[h];
      if (val === null || val === undefined) return '';
      if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    }).join(',')
  )
].join('\n');

fs.writeFileSync(outputPath, csvContent);
console.log(`Wrote ${cleanedData.length} rows to ${outputPath}`);

// Write warnings if any
if (warnings.length > 0) {
  console.log(`\nWriting ${warnings.length} warnings...`);
  const warningHeaders = ['npi', 'firstName', 'lastName', 'originalSpecialty', 'warning'];
  const warningsCsv = [
    warningHeaders.join(','),
    ...warnings.map(w =>
      warningHeaders.map(h => {
        const val = w[h];
        if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val || '';
      }).join(',')
    )
  ].join('\n');

  fs.writeFileSync(warningsPath, warningsCsv);
  console.log(`Wrote warnings to ${warningsPath}`);
}

// Print summary
console.log('\n=== SUMMARY ===');
console.log(`Total rows: ${data.length}`);
console.log(`MD: ${stats.MD}`);
console.log(`OD: ${stats.OD}`);
console.log(`DO: ${stats.DO}`);
console.log(`No valid degree: ${stats.null} (see warnings file)`);
console.log('\nColumn mapping:');
for (const [excel, db] of Object.entries(COLUMN_MAP)) {
  console.log(`  ${excel} -> ${db}`);
}
