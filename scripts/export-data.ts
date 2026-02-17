import * as fs from 'fs';
import * as path from 'path';

import { COUNTRIES, REGION_ORDER } from '../data/countries';
import { PATHWAYS } from '../data/pathways';
import { RESOURCES } from '../data/resources';
import { VENDORS } from '../data/vendors';
import { COMMUNITY, DEFAULT_COMMUNITY } from '../data/community';
import { getDecisionBriefsForCountry } from '../src/data/decisionBriefs';
import { isLaunchCountry, isDecisionReady, getCountryCoverage, COVERAGE_SUMMARY } from '../src/data/coverage';

const LAUNCH_COUNTRIES = ["portugal", "spain", "canada", "costa-rica", "panama", "ecuador", "malta", "united-kingdom"];

const outDir = path.join(__dirname, '..', 'export');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

fs.writeFileSync(path.join(outDir, 'countries.json'), JSON.stringify({ countries: COUNTRIES, regionOrder: REGION_ORDER }, null, 2));
fs.writeFileSync(path.join(outDir, 'pathways.json'), JSON.stringify(PATHWAYS, null, 2));
fs.writeFileSync(path.join(outDir, 'resources.json'), JSON.stringify(RESOURCES, null, 2));
fs.writeFileSync(path.join(outDir, 'vendors.json'), JSON.stringify(VENDORS, null, 2));
fs.writeFileSync(path.join(outDir, 'community.json'), JSON.stringify({ community: COMMUNITY, defaultCommunity: DEFAULT_COMMUNITY }, null, 2));

const allBriefs: any[] = [];
for (const slug of LAUNCH_COUNTRIES) {
  allBriefs.push(...getDecisionBriefsForCountry(slug));
}
fs.writeFileSync(path.join(outDir, 'decision-briefs.json'), JSON.stringify(allBriefs, null, 2));

const coverage: Record<string, any> = {};
for (const slug of LAUNCH_COUNTRIES) {
  coverage[slug] = {
    isLaunchCountry: true,
    isDecisionReady: isDecisionReady(slug),
    coverage: getCountryCoverage(slug),
  };
}
fs.writeFileSync(path.join(outDir, 'coverage.json'), JSON.stringify({ launchCountries: LAUNCH_COUNTRIES, coverage, summary: COVERAGE_SUMMARY }, null, 2));

console.log('Export complete:');
fs.readdirSync(outDir).forEach(f => {
  const size = fs.statSync(path.join(outDir, f)).size;
  console.log(`  ${f} (${(size / 1024).toFixed(1)} KB)`);
});
console.log(`\nTotal briefs: ${allBriefs.length}`);
