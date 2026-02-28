export type PassportCode = "us" | "uk" | "ca" | "au" | "eu" | "jp" | "cr";

export type PassportNote = {
  passport: PassportCode;
  note: string;
};

export type PathwayPassportNotes = {
  countrySlug: string;
  pathwayKey: string;
  notes: PassportNote[];
};

const PASSPORT_LABELS: Record<PassportCode, string> = {
  us: "US",
  uk: "UK",
  ca: "Canadian",
  au: "Australian",
  eu: "EU",
  jp: "Japanese",
  cr: "Costa Rican",
};

export { PASSPORT_LABELS };

const NOTES: PathwayPassportNotes[] = [
  {
    countrySlug: "portugal",
    pathwayKey: "d7",
    notes: [
      { passport: "us", note: "US citizens get 90-day visa-free entry to the Schengen Area, but must apply for the D7 at a Portuguese consulate before relocating. Remember that the US taxes worldwide income regardless of residency - consult a cross-border tax advisor." },
      { passport: "uk", note: "Post-Brexit, UK nationals no longer have EU free movement rights and must follow the same D7 visa process as non-EU applicants. 90-day visa-free Schengen access applies while your application is processed." },
      { passport: "ca", note: "Canadian citizens have 90-day visa-free Schengen access. The D7 process is the same as for US applicants. Canada does not tax non-residents on worldwide income, so moving your tax residency is simpler than for US citizens." },
      { passport: "au", note: "Australian citizens have 90-day visa-free Schengen access. Process is the same as other non-EU applicants. Australia does not tax non-residents on worldwide income once you establish foreign tax residency." },
      { passport: "eu", note: "EU/EEA citizens have the right to live and work in Portugal freely under EU free movement rules — no visa or residence permit is required. The D7 pathway is designed for non-EU nationals and is not relevant for EU passport holders." },
      { passport: "jp", note: "Japanese citizens have 90-day visa-free Schengen access. The D7 application process is the same as for other non-EU nationals. Japan taxes residents on worldwide income, so consult an advisor about the Japan-Portugal tax treaty to manage obligations in both countries." },
      { passport: "cr", note: "Costa Rican citizens have 90-day visa-free Schengen access (since 2023). The D7 process is the same as for other non-EU nationals. Costa Rica has a territorial tax system, so only local income is taxed — foreign-sourced income remitted to Portugal is not taxed by Costa Rica." },
    ],
  },
  {
    countrySlug: "portugal",
    pathwayKey: "d8",
    notes: [
      { passport: "us", note: "Same Schengen visa-free access applies. The minimum income threshold is 4x Portuguese minimum wage (approx. 3,500 EUR/month). US worldwide taxation still applies - Portugal's NHR (Non-Habitual Resident) tax regime may help reduce double taxation." },
      { passport: "uk", note: "UK nationals follow the same D8 process as other non-EU applicants post-Brexit. Income must come from outside Portugal. Consider the UK-Portugal double tax treaty for tax planning." },
      { passport: "ca", note: "Same process as other non-EU nationals. Canada-Portugal double tax treaty can help avoid double taxation on remote work income." },
      { passport: "au", note: "Same process as other non-EU nationals. Australia-Portugal double tax treaty applies. Ensure your employer or client arrangement qualifies as 'remote work from outside Portugal' under the D8 rules." },
      { passport: "eu", note: "EU/EEA citizens can live and work remotely in Portugal without any visa — EU free movement covers all work arrangements. The D8 digital nomad visa is only for non-EU nationals. EU citizens may still benefit from Portugal's NHR tax regime if establishing tax residency." },
      { passport: "jp", note: "Japanese citizens follow the same D8 process as other non-EU nationals. Income must come from non-Portuguese sources. Japan's worldwide income taxation applies, but the Japan-Portugal tax treaty can help offset double taxation on remote work earnings." },
      { passport: "cr", note: "Costa Rican citizens have visa-free Schengen access for 90 days. Same D8 application process as other non-EU nationals. Costa Rica's territorial tax system means your remote work income is not taxed by Costa Rica, simplifying your tax situation compared to US or Japanese applicants." },
    ],
  },
  {
    countrySlug: "spain",
    pathwayKey: "nlv",
    notes: [
      { passport: "us", note: "US citizens have 90-day visa-free Schengen access. The NLV prohibits all work in Spain, including remote work for US employers - this is strictly enforced. US worldwide taxation applies alongside Spanish tax obligations." },
      { passport: "uk", note: "Post-Brexit, UK nationals need this visa like other non-EU citizens. The no-work restriction applies equally. The UK-Spain double tax treaty helps manage tax obligations across both countries." },
      { passport: "ca", note: "Same application process as other non-EU nationals. Financial requirements (approx. 28,800 EUR/year) are the same regardless of nationality. Canada will not tax you once you sever tax residency." },
      { passport: "au", note: "Same process as other non-EU nationals. The financial threshold is the same for all applicants. Australia stops taxing non-residents on non-Australian income." },
      { passport: "eu", note: "EU/EEA citizens can live in Spain freely under EU free movement — no visa required. The Non-Lucrative Visa is designed exclusively for non-EU nationals. EU citizens who move to Spain simply register with local authorities (empadronamiento) and obtain an EU citizen certificate." },
      { passport: "jp", note: "Japanese citizens have 90-day visa-free Schengen access. The same NLV application and no-work restrictions apply. Japan-Spain have a bilateral tax treaty that covers passive income — relevant since work is prohibited under this visa." },
      { passport: "cr", note: "Costa Rican citizens have 90-day visa-free Schengen access. Same NLV process and financial requirements as other non-EU applicants. Costa Rica has limited tax treaty coverage with Spain, so consult a tax advisor about passive income treatment in both countries." },
    ],
  },
  {
    countrySlug: "spain",
    pathwayKey: "dnv",
    notes: [
      { passport: "us", note: "Available to US citizens working remotely for non-Spanish companies. Spain's special tax regime for digital nomads (Beckham Law) can cap income tax at 24% for up to 6 years. US worldwide taxation still applies but foreign tax credits offset the Spanish taxes." },
      { passport: "uk", note: "UK nationals are eligible on the same terms. The Beckham Law tax benefit is available regardless of nationality. Consider timing your move relative to the UK tax year for optimal tax treatment." },
      { passport: "ca", note: "Canadian citizens qualify on the same terms. Once you establish Spanish tax residency and sever Canadian ties, Canada generally stops taxing your employment income." },
      { passport: "au", note: "Australian citizens qualify under the same rules. Establishing foreign tax residency means Australia generally stops taxing your non-Australian employment income." },
      { passport: "eu", note: "EU/EEA citizens already have the right to live and work in Spain, including remotely, without any visa. The Digital Nomad Visa is for non-EU nationals only. However, EU citizens moving to Spain can still elect the Beckham Law tax regime if they meet eligibility criteria." },
      { passport: "jp", note: "Japanese citizens are eligible on the same terms as other non-EU nationals. The Beckham Law 24% flat tax rate is available regardless of nationality. Japan taxes residents on worldwide income — coordinate with the Japan-Spain tax treaty to avoid double taxation." },
      { passport: "cr", note: "Costa Rican citizens have visa-free Schengen access and can apply for the DNV on the same terms. The Beckham Law tax benefit applies equally. Costa Rica's territorial tax system means your Spanish remote work income is not taxed by Costa Rica." },
    ],
  },
  {
    countrySlug: "canada",
    pathwayKey: "express-entry",
    notes: [
      { passport: "us", note: "US citizens can enter Canada without a visa but still need to apply through Express Entry. USMCA (formerly NAFTA) provides some advantages for certain professional categories. US worldwide taxation applies even after becoming a Canadian resident." },
      { passport: "uk", note: "UK citizens need an eTA (Electronic Travel Authorization) for visits but must go through the full Express Entry process for permanent residency. Commonwealth ties do not provide immigration advantages here." },
      { passport: "ca", note: "This pathway is for foreign nationals seeking Canadian permanent residency. Canadian citizens already have the right to live and work in Canada." },
      { passport: "au", note: "Australian citizens need an eTA for visits. The Express Entry points system treats all nationalities equally. The Canada-Australia tax treaty covers double taxation on income during transition." },
      { passport: "eu", note: "EU citizens need an eTA for visits to Canada and must apply through the full Express Entry process like other foreign nationals. CETA (the EU-Canada trade agreement) does not provide immigration advantages for permanent residency. EU-Canada tax treaties vary by member state." },
      { passport: "jp", note: "Japanese citizens need an eTA for visits. Express Entry treats all nationalities equally on points. Japan has a Working Holiday agreement with Canada for those aged 18-30, which can be a stepping stone before applying for permanent residency." },
      { passport: "cr", note: "Costa Rican citizens need a visitor visa (not just an eTA) to enter Canada. The Express Entry points system is nationality-neutral, but language proficiency in English or French is heavily weighted. Costa Rica has no special bilateral immigration agreement with Canada." },
    ],
  },
  {
    countrySlug: "costa-rica",
    pathwayKey: "rentista",
    notes: [
      { passport: "us", note: "US citizens get 90-day visa-free entry. The $2,500/month income requirement is the same for all nationalities. US worldwide taxation applies - Costa Rica uses a territorial tax system (only local income is taxed), so remote US income is not taxed locally." },
      { passport: "uk", note: "UK citizens get 90-day visa-free entry. Same income requirements apply. The UK does not have a double tax treaty with Costa Rica, so consult a tax advisor about your specific situation." },
      { passport: "ca", note: "Canadian citizens get 90-day visa-free entry. Same income and process requirements. Canada-Costa Rica does not have a comprehensive tax treaty - plan accordingly." },
      { passport: "au", note: "Australian citizens get 90-day visa-free entry. Same process for all nationalities. No Australia-Costa Rica tax treaty exists, but Costa Rica's territorial tax system means only local income is taxed there." },
      { passport: "eu", note: "EU citizens get 90-day visa-free entry to Costa Rica. The Rentista process and $2,500/month income requirement are the same for all foreign nationals. Tax treaty availability depends on your specific EU member state — some have bilateral agreements with Costa Rica, others do not." },
      { passport: "jp", note: "Japanese citizens get 90-day visa-free entry to Costa Rica. Same income requirements and application process as other foreign nationals. Japan taxes residents on worldwide income, but Costa Rica's territorial tax system means only local Costa Rican income is taxed there." },
      { passport: "cr", note: "Costa Rican citizens already have the constitutional right to live and work in Costa Rica. The Rentista visa is designed for foreign nationals only and is not applicable to Costa Rican passport holders." },
    ],
  },
  {
    countrySlug: "costa-rica",
    pathwayKey: "pensionado",
    notes: [
      { passport: "us", note: "US Social Security income qualifies toward the $1,000/month minimum. US worldwide taxation still applies on pension income even while living abroad." },
      { passport: "uk", note: "UK state pension qualifies, but note that UK pensions paid to Costa Rica residents are frozen (no annual increases) because there is no reciprocal social security agreement." },
      { passport: "ca", note: "Canadian CPP/OAS pension qualifies. Canada has no social security agreement with Costa Rica, but pensions are still payable abroad. Canadian tax treatment of pensions paid to non-residents varies." },
      { passport: "au", note: "Australian Age Pension may be payable abroad but is subject to means testing and portability rules. Check with Services Australia whether your pension is portable to Costa Rica." },
      { passport: "eu", note: "EU citizens' state pensions from their home country generally qualify toward the $1,000/month minimum. Pension portability within the EU is guaranteed, but portability to Costa Rica depends on your specific member state's rules. No EU-wide tax treaty with Costa Rica exists." },
      { passport: "jp", note: "Japan's National Pension (Kokumin Nenkin) and Employees' Pension qualify toward the minimum. Japan has social security agreements with some countries but not Costa Rica — verify pension portability with the Japan Pension Service." },
      { passport: "cr", note: "Costa Rican citizens already have the right to live in Costa Rica. The Pensionado visa is designed for foreign retirees and is not applicable to Costa Rican nationals." },
    ],
  },
  {
    countrySlug: "panama",
    pathwayKey: "friendly-nations",
    notes: [
      { passport: "us", note: "The United States is on Panama's Friendly Nations list - US citizens are eligible. You need an economic tie to Panama (employment, business, or bank deposit of $5,000+). Panama uses territorial taxation - foreign-source income is not taxed." },
      { passport: "uk", note: "The United Kingdom is on the Friendly Nations list - UK citizens are eligible. Same economic tie requirements apply. Post-Brexit status does not affect eligibility." },
      { passport: "ca", note: "Canada is on the Friendly Nations list - Canadian citizens are eligible. Same process and requirements as other qualifying nationalities." },
      { passport: "au", note: "Australia is on the Friendly Nations list - Australian citizens are eligible. Same requirements apply. Panama's territorial tax system is favorable for those with foreign-source income." },
      { passport: "eu", note: "Many EU member states are on Panama's Friendly Nations list, including France, Germany, Spain, and the Netherlands. Eligibility depends on your specific EU citizenship. Same economic tie requirements (employment, business, or $5,000 bank deposit) apply." },
      { passport: "jp", note: "Japan is on Panama's Friendly Nations list — Japanese citizens are eligible. Same economic tie requirements apply. Japan taxes residents on worldwide income, but Panama's territorial tax system means only Panama-sourced income is taxed locally." },
      { passport: "cr", note: "Costa Rica is on Panama's Friendly Nations list — Costa Rican citizens are eligible. Geographic proximity makes this a popular option. Same economic tie requirements apply, and Panama's territorial tax system complements Costa Rica's similar approach." },
    ],
  },
  {
    countrySlug: "panama",
    pathwayKey: "pensionado",
    notes: [
      { passport: "us", note: "US Social Security or private pension income qualifies for the $1,000/month minimum. Panama offers significant retiree discounts (energy, hotels, restaurants, flights). US worldwide taxation still applies." },
      { passport: "uk", note: "UK state pension qualifies. Note that UK pensions paid to Panama may be frozen (no annual uprating). Private pensions also qualify toward the minimum." },
      { passport: "ca", note: "CPP/OAS payments qualify. Canada does not have a social security agreement with Panama. Check pension portability rules with Service Canada." },
      { passport: "au", note: "Australian Age Pension portability to Panama is limited - check with Services Australia. Private superannuation income can qualify toward the minimum." },
      { passport: "eu", note: "EU citizens' state pensions generally qualify toward the $1,000/month minimum. Pension portability outside the EU depends on your specific member state's bilateral agreements with Panama. Panama's retiree discounts (pensionado benefits) apply equally to all nationalities." },
      { passport: "jp", note: "Japan's National Pension and Employees' Pension qualify toward the $1,000/month minimum. Japan does not have a social security agreement with Panama, so verify portability. Panama's generous retiree discount program applies to all foreign pensionado visa holders." },
      { passport: "cr", note: "Costa Rican pension income (CCSS/IVM) qualifies toward the minimum. Costa Rica's geographic proximity to Panama makes this a practical retirement option. Panama's territorial tax system means foreign pension income is not taxed locally." },
    ],
  },
  {
    countrySlug: "panama",
    pathwayKey: "self-economic-solvency",
    notes: [
      { passport: "us", note: "All nationalities qualify for this investment-based visa. The $300,000+ requirement can be met through Panama real estate or a fixed-term bank deposit. US FBAR and FATCA reporting requirements apply to Panamanian bank accounts." },
      { passport: "uk", note: "Same investment thresholds for all nationalities. The UK-Panama double tax treaty (limited scope) may apply to certain income types. Report foreign accounts to HMRC as required." },
      { passport: "ca", note: "Same requirements for all nationalities. Canadian foreign property reporting (T1135) applies if your Panamanian assets exceed CAD $100,000." },
      { passport: "au", note: "Same requirements for all nationalities. Australian foreign income and asset reporting rules apply. Consult an Australian tax advisor about CGT implications of foreign property." },
      { passport: "eu", note: "Same investment thresholds ($300,000+) apply for all nationalities. EU citizens may have additional foreign asset reporting obligations depending on their member state. Panama has limited tax treaty coverage with EU countries, so consult a tax advisor for your specific situation." },
      { passport: "jp", note: "Same $300,000+ investment requirement applies. Japanese citizens must report foreign assets to Japan's National Tax Agency if total overseas assets exceed ¥50 million. Japan taxes worldwide income, including capital gains on foreign property." },
      { passport: "cr", note: "Same investment requirements apply to Costa Rican citizens. Geographic proximity and existing banking relationships between Costa Rica and Panama can simplify the process. Costa Rica's territorial tax system means gains from Panamanian investments are generally not taxed by Costa Rica." },
    ],
  },
  {
    countrySlug: "ecuador",
    pathwayKey: "rentista",
    notes: [
      { passport: "us", note: "US citizens get 90-day visa-free entry. The $1,410/month income requirement applies equally to all nationalities. Ecuador uses the US dollar, eliminating currency exchange risk. US worldwide taxation still applies." },
      { passport: "uk", note: "UK citizens get 90-day visa-free entry. Ecuador's dollarized economy means no exchange rate risk vs USD, but GBP earners are exposed to GBP/USD fluctuations." },
      { passport: "ca", note: "Canadian citizens get 90-day visa-free entry. Same income requirements. Ecuador's dollarized economy means CAD/USD exchange rates affect your purchasing power." },
      { passport: "au", note: "Australian citizens get 90-day visa-free entry. Same process and requirements. AUD/USD exchange rates affect the real cost of meeting the income threshold." },
      { passport: "eu", note: "EU citizens get 90-day visa-free entry to Ecuador. Same $1,410/month income requirement as all other foreign nationals. Ecuador's dollarized economy means EUR/USD exchange rates directly affect your cost of living and income threshold calculations." },
      { passport: "jp", note: "Japanese citizens get 90-day visa-free entry to Ecuador. Same income requirements apply. Japan taxes worldwide income — Ecuador does not have a tax treaty with Japan, so plan for potential double taxation. JPY/USD exchange rates affect the real income threshold." },
      { passport: "cr", note: "Costa Rican citizens get 90-day visa-free entry to Ecuador. Same income requirements and process apply. Both countries use territorial-style tax systems, which simplifies cross-border tax planning. Ecuador's dollarized economy links directly to the USD-pegged Costa Rican colón." },
    ],
  },
  {
    countrySlug: "ecuador",
    pathwayKey: "jubilado",
    notes: [
      { passport: "us", note: "US Social Security qualifies toward the $1,410/month minimum. Ecuador's dollarized economy means your pension amount is predictable. US worldwide taxation applies." },
      { passport: "uk", note: "UK state pension qualifies but is frozen in Ecuador (no annual increases) due to lack of a reciprocal agreement. Factor in GBP/USD exchange rate risk since Ecuador uses the US dollar." },
      { passport: "ca", note: "CPP/OAS qualifies. Canada does not have a social security agreement with Ecuador. Pension is payable abroad but check portability rules." },
      { passport: "au", note: "Australian Age Pension portability to Ecuador is limited - verify with Services Australia. Private super income can qualify. AUD/USD exchange rates affect value." },
      { passport: "eu", note: "EU citizens' state pensions generally qualify toward the $1,410/month minimum. Pension portability to Ecuador varies by member state — check with your national pension authority. Ecuador's dollarized economy means EUR/USD rates directly affect your pension's local purchasing power." },
      { passport: "jp", note: "Japan's National Pension qualifies toward the minimum, but verify portability to Ecuador with the Japan Pension Service. No Japan-Ecuador tax treaty exists, so pension income may face double taxation. JPY/USD exchange rates affect the effective value." },
      { passport: "cr", note: "Costa Rican CCSS/IVM pension income qualifies toward the minimum. Geographic proximity within the Americas makes Ecuador a practical retirement destination. Ecuador's dollarized economy simplifies finances for those accustomed to USD-linked currencies." },
    ],
  },
  {
    countrySlug: "malta",
    pathwayKey: "digital-nomad",
    notes: [
      { passport: "us", note: "US citizens have 90-day visa-free Schengen access. Malta's permit is for one year, renewable. Minimum income of 3,500 EUR/month required. US worldwide taxation applies - Malta's flat 15% tax on remitted income may be offset by foreign tax credits." },
      { passport: "uk", note: "Post-Brexit, UK nationals need this permit like other non-EU citizens. The Malta-UK double tax treaty provides strong protections against double taxation. English is an official language in Malta." },
      { passport: "ca", note: "Canadian citizens have 90-day visa-free Schengen access. Same requirements as other non-EU nationals. Canada-Malta tax treaty helps manage cross-border taxation." },
      { passport: "au", note: "Australian citizens have 90-day visa-free Schengen access. Same process and thresholds. No comprehensive Australia-Malta tax treaty exists - consult a tax advisor." },
      { passport: "eu", note: "EU/EEA citizens can live and work in Malta freely under EU free movement rules — no digital nomad permit is needed. This pathway is designed for non-EU nationals only. EU citizens working remotely in Malta should register for tax purposes if staying beyond 183 days." },
      { passport: "jp", note: "Japanese citizens have 90-day visa-free Schengen access. Same digital nomad permit process and 3,500 EUR/month income threshold as other non-EU nationals. Japan taxes worldwide income — the Japan-Malta tax information exchange agreement may assist with compliance." },
      { passport: "cr", note: "Costa Rican citizens have 90-day visa-free Schengen access (since 2023). Same permit process and income requirements as other non-EU nationals. English is an official language in Malta, which eases the transition. Costa Rica has no tax treaty with Malta." },
    ],
  },
  {
    countrySlug: "malta",
    pathwayKey: "grp",
    notes: [
      { passport: "us", note: "US citizens are eligible. Minimum property purchase of 275,000 EUR (or 220,000 EUR in Gozo/South Malta) required. The flat 15% tax rate on remitted foreign income is attractive, but US worldwide taxation means you pay the higher of the two rates." },
      { passport: "uk", note: "UK nationals are eligible post-Brexit. The GRP offers a flat 15% tax on remitted income with a minimum annual tax of 15,000 EUR. English is widely spoken, and the UK-Malta tax treaty is well established." },
      { passport: "ca", note: "Canadian citizens are eligible. Same property and tax requirements for all non-EU applicants. The minimum 15,000 EUR annual tax applies regardless of nationality." },
      { passport: "au", note: "Australian citizens are eligible. Same requirements apply. Consider CGT implications in Australia if you later sell Maltese property." },
      { passport: "eu", note: "EU/EEA citizens can live in Malta freely and do not need the GRP for residency. However, EU citizens may still apply for the GRP's favorable 15% flat tax on remitted foreign income if they meet the property and minimum tax requirements." },
      { passport: "jp", note: "Japanese citizens are eligible on the same terms. The GRP's 15% flat tax on remitted income is attractive, but Japan's worldwide income taxation means you must report all income to Japan's NTA. The minimum 15,000 EUR annual tax applies regardless of nationality." },
      { passport: "cr", note: "Costa Rican citizens are eligible on the same terms. Same property purchase requirements (275,000 EUR or 220,000 EUR in Gozo/South Malta) and minimum annual tax of 15,000 EUR apply. Costa Rica's territorial tax system means Maltese property gains are generally not taxed by Costa Rica." },
    ],
  },
  {
    countrySlug: "united-kingdom",
    pathwayKey: "skilled-worker",
    notes: [
      { passport: "us", note: "US citizens need employer sponsorship from a licensed UK sponsor. Minimum salary thresholds vary by occupation (generally 38,700 GBP/year). No special bilateral agreement gives US citizens preferential access." },
      { passport: "uk", note: "UK citizens and those with settled/pre-settled status already have the right to work in the UK. This visa is for foreign nationals only." },
      { passport: "ca", note: "Canadian citizens have no preferential access - standard sponsorship requirements apply. Some roles on the Immigration Salary List may have lower salary thresholds." },
      { passport: "au", note: "Australian citizens can also consider the Youth Mobility Scheme (Tier 5) if aged 18-30, which allows 2 years of work without employer sponsorship. Otherwise, standard Skilled Worker rules apply." },
      { passport: "eu", note: "Post-Brexit, EU citizens no longer have automatic work rights in the UK and must apply for a Skilled Worker visa with employer sponsorship, just like other non-UK nationals. Those with EU Settlement Scheme status (settled or pre-settled) retain their work rights." },
      { passport: "jp", note: "Japanese citizens can consider the UK-Japan Youth Mobility Scheme if aged 18-30, which allows up to 2 years of work without sponsorship. Otherwise, standard Skilled Worker sponsorship requirements apply. The UK-Japan tax treaty covers employment income." },
      { passport: "cr", note: "Costa Rican citizens need a visa to enter the UK and must secure employer sponsorship for the Skilled Worker visa. Standard salary thresholds apply with no preferential access. Costa Rica has no special bilateral immigration agreement with the UK." },
    ],
  },
  {
    countrySlug: "united-kingdom",
    pathwayKey: "global-talent",
    notes: [
      { passport: "us", note: "Open to all nationalities based on exceptional talent or promise. No employer sponsorship needed. Tech Nation, UKRI, or Arts Council endorsement required depending on your field." },
      { passport: "uk", note: "UK citizens already have the right to live and work in the UK. This visa is for foreign nationals demonstrating exceptional talent." },
      { passport: "ca", note: "Same endorsement requirements for all nationalities. This is one of the few UK visas that doesn't require employer sponsorship - ideal for founders and researchers." },
      { passport: "au", note: "Same process for all nationalities. Australians aged 18-30 might also consider the Youth Mobility Scheme as an alternative entry point before pursuing Global Talent." },
      { passport: "eu", note: "Post-Brexit, EU citizens need this visa like other non-UK nationals to work in the UK based on exceptional talent. Same endorsement requirements apply. EU citizens with settled status under the EU Settlement Scheme do not need this visa." },
      { passport: "jp", note: "Japanese citizens are eligible on the same terms. Same endorsement process through Tech Nation, UKRI, or Arts Council. Japanese nationals aged 18-30 might also consider the Youth Mobility Scheme as an initial UK entry point." },
      { passport: "cr", note: "Costa Rican citizens are eligible on the same terms — the Global Talent visa is nationality-neutral and based purely on endorsement. No employer sponsorship needed, making it accessible regardless of bilateral agreements. A UK visa is required for entry." },
    ],
  },
  {
    countrySlug: "united-kingdom",
    pathwayKey: "innovator-founder",
    notes: [
      { passport: "us", note: "US citizens need endorsement from an approved body for their business plan. At least 50,000 GBP in investment funds required. No special bilateral trade agreement affects eligibility." },
      { passport: "uk", note: "UK citizens already have the right to start businesses in the UK. This visa is for foreign nationals with innovative business ideas." },
      { passport: "ca", note: "Canadian citizens follow the same process. CPTPP (trade agreement) does not provide immigration benefits for this visa category." },
      { passport: "au", note: "Australian citizens follow the same process. Consider whether the Youth Mobility Scheme (if age-eligible) could be used to test your business idea before committing to the Innovator Founder route." },
      { passport: "eu", note: "Post-Brexit, EU citizens must follow the same Innovator Founder process as other non-UK nationals. Same endorsement and 50,000 GBP investment requirements apply. EU citizens with settled status already have the right to start businesses in the UK." },
      { passport: "jp", note: "Japanese citizens follow the same endorsement and investment process. The UK-Japan Comprehensive Economic Partnership Agreement (CEPA) signals strong bilateral ties but does not provide direct immigration advantages for this visa category." },
      { passport: "cr", note: "Costa Rican citizens are eligible on the same terms. A UK visa is required for entry. Same endorsement and 50,000 GBP investment requirements apply — no special bilateral agreement affects the process." },
    ],
  },
  {
    countrySlug: "portugal",
    pathwayKey: "student",
    notes: [
      { passport: "us", note: "US citizens need a student visa (D4) issued by a Portuguese consulate. Proof of enrollment at a recognized institution and sufficient funds required. US worldwide taxation applies to any income earned while studying." },
      { passport: "uk", note: "Post-Brexit, UK nationals follow the same student visa process as non-EU applicants. No preferential access. The UK student loan repayment obligations continue regardless of where you live." },
      { passport: "ca", note: "Canadian citizens follow the same D4 visa process. Canadian student loans may have different repayment terms while abroad — check with your provider." },
      { passport: "au", note: "Australian citizens follow the same process. HECS-HELP repayment obligations apply once you earn above the threshold, even while overseas. Check current rules with the ATO." },
      { passport: "eu", note: "EU/EEA citizens can study in Portugal without a student visa and pay the same tuition fees as Portuguese nationals at public universities. EU free movement covers enrollment — simply register with local authorities upon arrival." },
      { passport: "jp", note: "Japanese citizens need a D4 student visa from a Portuguese consulate, same as other non-EU nationals. Japan offers some government scholarships (MEXT) for study abroad. Japan taxes worldwide income, including any part-time earnings in Portugal." },
      { passport: "cr", note: "Costa Rican citizens have visa-free Schengen access for 90 days but need a D4 student visa for longer study periods. Same enrollment and financial proof requirements as other non-EU applicants. Some Portuguese universities offer scholarships for Latin American students." },
    ],
  },
  {
    countrySlug: "spain",
    pathwayKey: "student",
    notes: [
      { passport: "us", note: "US citizens need a student visa from a Spanish consulate. Student visas do not count toward the 5-year residency requirement for permanent residency. Limited work permitted (up to 20 hours/week with authorization)." },
      { passport: "uk", note: "Post-Brexit, UK nationals need a student visa like other non-EU citizens. Time on a student visa does not count toward permanent residency in Spain." },
      { passport: "ca", note: "Canadian citizens follow the same process. Student visas allow limited part-time work. Time spent on a student visa generally does not count toward permanent residency." },
      { passport: "au", note: "Australian citizens follow the same process. Limited part-time work is permitted with additional authorization. Student visa time does not count toward Spanish permanent residency." },
      { passport: "eu", note: "EU/EEA citizens can study in Spain without a student visa and pay the same tuition fees as Spanish nationals at public universities. No residency permit needed — simply register with the local foreigners' office (Oficina de Extranjería) for an EU citizen certificate." },
      { passport: "jp", note: "Japanese citizens need a student visa from a Spanish consulate. Same process and part-time work restrictions as other non-EU nationals. Japan has a Working Holiday agreement with Spain for those aged 18-30, which could be an alternative to a student visa." },
      { passport: "cr", note: "Costa Rican citizens have visa-free Schengen access for 90 days but need a student visa for longer study. Same process and part-time work restrictions as other non-EU applicants. Spanish language proficiency is an advantage for Costa Rican applicants." },
    ],
  },
  {
    countrySlug: "france",
    pathwayKey: "talent-passport",
    notes: [
      { passport: "us", note: "US citizens are eligible across all Talent Passport categories (entrepreneur, investor, researcher, artist, tech worker). The US-France tax treaty helps manage double taxation. Some categories require a minimum salary threshold." },
      { passport: "uk", note: "Post-Brexit, UK nationals apply as non-EU citizens. The UK-France double tax treaty applies. English proficiency is helpful but some French language ability is expected for daily life and certain administrative processes." },
      { passport: "ca", note: "Canadian citizens are eligible on the same terms. The CETA trade agreement between Canada and the EU does not directly affect this visa but signals strong bilateral ties. Canada-France tax treaty applies." },
      { passport: "au", note: "Australian citizens are eligible on the same terms. No special bilateral agreement affects eligibility. The Australia-France tax treaty covers double taxation on income." },
      { passport: "eu", note: "EU/EEA citizens can live and work in France freely under EU free movement — no Talent Passport needed. This visa is for non-EU nationals only. EU citizens who move to France simply register with local authorities and may benefit from France's tax incentives for new residents (impatriate regime)." },
      { passport: "jp", note: "Japanese citizens are eligible on the same terms. Japan has a Working Holiday agreement with France for those aged 18-30, which could serve as an alternative or stepping stone. The Japan-France tax treaty covers most income categories for those on a Talent Passport." },
      { passport: "cr", note: "Costa Rican citizens are eligible on the same terms. Visa-free Schengen access (90 days) allows initial visits, but the Talent Passport is required for extended stays. Costa Rica has no comprehensive tax treaty with France — consult a cross-border tax advisor." },
    ],
  },
  {
    countrySlug: "france",
    pathwayKey: "visitor",
    notes: [
      { passport: "us", note: "US citizens get 90-day visa-free Schengen access. The long-stay visitor visa (VLS-TS) is for stays over 90 days without working. You must demonstrate sufficient financial resources. No work of any kind is permitted." },
      { passport: "uk", note: "Post-Brexit, UK nationals have 90-day visa-free Schengen access and must apply for a long-stay visa for longer periods. Same restrictions on work apply. The UK-France proximity makes this popular for part-year living." },
      { passport: "ca", note: "Canadian citizens have 90-day visa-free Schengen access. Same visitor visa process for longer stays. No work permitted. Financial self-sufficiency must be demonstrated." },
      { passport: "au", note: "Australian citizens have 90-day visa-free Schengen access. Same long-stay visitor visa process. France's Working Holiday Visa (if aged 18-35) may be a better option if you want to work." },
      { passport: "eu", note: "EU/EEA citizens can live in France freely under EU free movement — no visitor visa is required regardless of stay length. This pathway is for non-EU nationals only. EU citizens simply register with local authorities if staying beyond three months." },
      { passport: "jp", note: "Japanese citizens have 90-day visa-free Schengen access. Same VLS-TS visitor visa process for longer stays. No work permitted. Japan has a Working Holiday agreement with France (ages 18-30), which may be a better option if you want flexibility to work." },
      { passport: "cr", note: "Costa Rican citizens have 90-day visa-free Schengen access. Same VLS-TS application process for longer stays. No work is permitted on this visa. Financial self-sufficiency requirements are the same as for other non-EU applicants." },
    ],
  },
  {
    countrySlug: "italy",
    pathwayKey: "elective-residency",
    notes: [
      { passport: "us", note: "US citizens get 90-day visa-free Schengen access. The Elective Residency Visa requires proof of substantial passive income or savings (typically 31,000+ EUR/year). No work is permitted. US worldwide taxation applies alongside Italian tax obligations." },
      { passport: "uk", note: "Post-Brexit, UK nationals follow the same process as non-EU applicants. The UK-Italy double tax treaty applies. Pension income from the UK is generally taxable in Italy under the flat tax regime for new residents (if elected)." },
      { passport: "ca", note: "Canadian citizens follow the same process. The income threshold is the same for all nationalities. Canada-Italy tax treaty helps manage double taxation. Canadian pension income may qualify toward the income requirement." },
      { passport: "au", note: "Australian citizens follow the same process. The income/savings threshold applies equally. Italy's flat tax regime for new residents (100,000 EUR/year on foreign income) may be attractive for high earners." },
      { passport: "eu", note: "EU/EEA citizens can live in Italy freely under EU free movement — no Elective Residency Visa is needed. This pathway is for non-EU nationals only. EU citizens moving to Italy simply register with the local Anagrafe (registry office) and may elect Italy's flat tax regime on foreign income." },
      { passport: "jp", note: "Japanese citizens have 90-day visa-free Schengen access. Same Elective Residency process and income requirements as other non-EU nationals. Japan taxes worldwide income — the Japan-Italy tax treaty helps manage double taxation on passive and pension income." },
      { passport: "cr", note: "Costa Rican citizens have 90-day visa-free Schengen access. Same process and income/savings thresholds as other non-EU applicants. Costa Rica has no tax treaty with Italy, but Costa Rica's territorial tax system means Italian-sourced passive income is not taxed by Costa Rica." },
    ],
  },
  {
    countrySlug: "italy",
    pathwayKey: "digital-nomad",
    notes: [
      { passport: "us", note: "US citizens are eligible for Italy's Digital Nomad Visa. Minimum annual income of approximately 28,000 EUR required from non-Italian sources. US worldwide taxation applies — Italy's tax treatment of digital nomads is still being clarified." },
      { passport: "uk", note: "Post-Brexit, UK nationals apply as non-EU citizens. Same income requirements. The UK-Italy double tax treaty covers employment and self-employment income. Italy's digital nomad regime is relatively new — rules may evolve." },
      { passport: "ca", note: "Canadian citizens are eligible on the same terms. Income must come from outside Italy. Canada-Italy tax treaty applies. The visa is relatively new, so processing times and requirements may vary between consulates." },
      { passport: "au", note: "Australian citizens are eligible on the same terms. Same income thresholds apply. No comprehensive Australia-Italy tax treaty exists for digital nomad-specific situations — consult a cross-border tax advisor." },
      { passport: "eu", note: "EU/EEA citizens can live and work remotely in Italy without any visa under EU free movement. The Digital Nomad Visa is for non-EU nationals only. EU citizens working remotely in Italy should be aware of tax residency rules if staying beyond 183 days in a calendar year." },
      { passport: "jp", note: "Japanese citizens are eligible on the same terms. Same 28,000 EUR/year minimum income from non-Italian sources. Japan taxes worldwide income — the Japan-Italy tax treaty covers employment and self-employment income. The visa is still relatively new, so consular processing may vary." },
      { passport: "cr", note: "Costa Rican citizens have visa-free Schengen access and can apply on the same terms. Same income requirements apply. Costa Rica's territorial tax system means your remote work income earned in Italy is generally not taxed by Costa Rica, simplifying cross-border tax obligations." },
    ],
  },
  {
    countrySlug: "thailand",
    pathwayKey: "ltr",
    notes: [
      { passport: "us", note: "US citizens are eligible across all LTR categories (wealthy global citizen, wealthy pensioner, work-from-Thailand professional, highly-skilled professional). The income threshold is $80,000/year for remote workers. A key benefit is the 17% flat tax rate on Thai-sourced employment income. US worldwide taxation still applies." },
      { passport: "uk", note: "UK nationals are eligible on the same terms. The UK-Thailand double tax treaty covers most income types. The LTR's 10-year duration and work permit exemption make it attractive for long-term relocation." },
      { passport: "ca", note: "Canadian citizens are eligible on the same terms. Same income thresholds. Canada-Thailand tax treaty applies. The 10-year visa eliminates the need for frequent visa runs that affect shorter-stay options." },
      { passport: "au", note: "Australian citizens are eligible on the same terms. The Australia-Thailand tax treaty applies. The LTR program was designed to attract high-value residents — the income thresholds are the same for all nationalities." },
      { passport: "eu", note: "EU citizens are eligible on the same terms as other foreign nationals — Thailand does not distinguish between EU and non-EU applicants. Same $80,000/year income threshold for remote workers. Tax treaty availability with Thailand varies by EU member state; check your country's bilateral agreement." },
      { passport: "jp", note: "Japanese citizens are eligible on the same terms. The Japan-Thailand tax treaty is comprehensive and covers most income categories. Japan taxes worldwide income, but the LTR's 17% flat tax on Thai employment income can be offset via foreign tax credits in Japan." },
      { passport: "cr", note: "Costa Rican citizens are eligible on the same terms. Same $80,000/year income threshold for remote workers. Costa Rica has no tax treaty with Thailand, but Costa Rica's territorial tax system means Thai-sourced income is generally not taxed by Costa Rica. Visa-free entry to Thailand is limited for Costa Ricans — check current entry requirements." },
    ],
  },
  {
    countrySlug: "thailand",
    pathwayKey: "retirement",
    notes: [
      { passport: "us", note: "US citizens aged 50+ are eligible. Requires 800,000 THB in a Thai bank account or 65,000 THB/month income. US Social Security qualifies as income proof. US worldwide taxation applies. Thailand does not tax foreign-sourced income not remitted in the same calendar year (though this rule is changing)." },
      { passport: "uk", note: "UK nationals aged 50+ follow the same process. UK state pension qualifies as income proof. Note: UK pensions paid to Thailand are frozen (no annual increases). The UK-Thailand double tax treaty covers pension income." },
      { passport: "ca", note: "Canadian citizens aged 50+ are eligible. CPP/OAS income qualifies. Same financial requirements for all nationalities. Canada does not have a pension-freezing issue like the UK — pensions are indexed regardless of country of residence." },
      { passport: "au", note: "Australian citizens aged 50+ are eligible. Australian Age Pension portability to Thailand is limited — check with Services Australia. Superannuation income may qualify toward the income requirement. Same bank deposit option available." },
      { passport: "eu", note: "EU citizens aged 50+ are eligible on the same terms as other foreign nationals. Same 800,000 THB bank deposit or 65,000 THB/month income requirement. EU state pensions qualify as income proof — portability to Thailand depends on your specific member state's rules." },
      { passport: "jp", note: "Japanese citizens aged 50+ are eligible. Japan's National Pension and Employees' Pension qualify as income proof. Japan has a social security agreement with Thailand, which can help with pension portability. Japan taxes worldwide income, including pension income received abroad." },
      { passport: "cr", note: "Costa Rican citizens aged 50+ are eligible on the same terms. CCSS/IVM pension income qualifies toward the income requirement. Costa Rica has no social security agreement with Thailand — verify pension portability. Check current Thai visa-on-arrival or visa requirements for Costa Rican nationals before traveling." },
    ],
  },
  {
    countrySlug: "mexico",
    pathwayKey: "temporary-resident",
    notes: [
      { passport: "us", note: "US citizens get 180-day visa-free entry as tourists. The Temporary Resident Visa requires monthly income of approximately $2,500 USD or savings of $42,000 USD. The US-Mexico tax treaty applies. Mexico taxes residents on worldwide income." },
      { passport: "uk", note: "UK nationals get 180-day visa-free entry. Same income/savings requirements for all nationalities. The UK-Mexico double tax treaty applies. Mexico is in a significantly different time zone from the UK — factor this into remote work arrangements." },
      { passport: "ca", note: "Canadian citizens get 180-day visa-free entry. Same requirements. The Canada-Mexico tax treaty (under USMCA framework) applies. Snowbird culture means well-established Canadian expat communities exist in many Mexican cities." },
      { passport: "au", note: "Australian citizens get 180-day visa-free entry. Same process and financial thresholds. No comprehensive Australia-Mexico tax treaty exists — consult a cross-border tax advisor about double taxation." },
      { passport: "eu", note: "EU citizens get 180-day visa-free entry to Mexico. Same income/savings requirements as all other foreign nationals. Mexico has tax treaties with several EU member states (Germany, France, Spain, Netherlands, etc.) — check whether your specific country has coverage." },
      { passport: "jp", note: "Japanese citizens get 180-day visa-free entry to Mexico. Same financial requirements apply. The Japan-Mexico Economic Partnership Agreement (EPA) strengthens bilateral ties. Japan taxes worldwide income — the Japan-Mexico tax treaty helps manage double taxation." },
      { passport: "cr", note: "Costa Rican citizens get visa-free entry to Mexico (up to 180 days). Same Temporary Resident income/savings requirements apply. Central American proximity means well-established travel routes and some Costa Rican expat communities in Mexico. Costa Rica has no tax treaty with Mexico." },
    ],
  },
  {
    countrySlug: "mexico",
    pathwayKey: "permanent-resident",
    notes: [
      { passport: "us", note: "US citizens can apply after 4 years of temporary residency, or directly if meeting higher income/savings thresholds (approximately $4,200/month or $175,000 in savings). US worldwide taxation continues. Mexico also taxes residents on worldwide income — the US-Mexico tax treaty helps avoid double taxation." },
      { passport: "uk", note: "UK nationals follow the same process. Same income thresholds regardless of nationality. Permanent residency grants full work rights without employer sponsorship. The UK-Mexico double tax treaty covers most income types." },
      { passport: "ca", note: "Canadian citizens follow the same process. Same financial requirements. Permanent residency grants unrestricted work rights. Well-established Canadian expat support networks exist across Mexico." },
      { passport: "au", note: "Australian citizens follow the same process. Same thresholds apply. No Australia-Mexico tax treaty — plan for potential double taxation. Permanent residency grants full work authorization." },
      { passport: "eu", note: "EU citizens follow the same process as other foreign nationals. Same income/savings thresholds apply. Permanent residency grants full work rights. Tax treaty coverage between Mexico and your specific EU member state varies — consult an advisor for your nationality." },
      { passport: "jp", note: "Japanese citizens follow the same process. Same financial thresholds apply. Permanent residency grants full work rights. The Japan-Mexico tax treaty and EPA provide a strong bilateral framework. Japan taxes worldwide income, so coordinate with both countries' tax obligations." },
      { passport: "cr", note: "Costa Rican citizens follow the same process. Same income/savings thresholds apply. Permanent residency grants full work rights without restriction. Geographic proximity and cultural ties between Costa Rica and Mexico can ease the transition. No Costa Rica-Mexico tax treaty exists." },
    ],
  },
  {
    countrySlug: "germany",
    pathwayKey: "eu-blue-card",
    notes: [
      { passport: "us", note: "US citizens need to apply for an EU Blue Card at a German embassy before relocating. Your degree must be recognised via the anabin database or a ZAB assessment. US worldwide taxation applies alongside German tax obligations - the US-Germany tax treaty helps avoid double taxation." },
      { passport: "uk", note: "Post-Brexit, UK nationals follow the same process as other non-EU applicants. The UK-Germany double tax treaty applies. Some UK qualifications may require formal recognition through ZAB." },
      { passport: "ca", note: "Canadian citizens follow the same process. Canada-Germany tax treaty helps manage cross-border taxation. Canadian degrees are generally well-recognised but may still need ZAB assessment." },
      { passport: "au", note: "Australian citizens follow the same process. Australian qualifications are generally well-regarded but formal recognition may be required. The Australia-Germany tax treaty covers employment income." },
      { passport: "eu", note: "EU/EEA citizens have the right to live and work in Germany freely under EU free movement rules. The EU Blue Card is designed for non-EU nationals and is not required for EU passport holders." },
      { passport: "jp", note: "Japanese citizens follow the same process as other non-EU nationals. The Japan-Germany tax treaty covers employment income. Japanese degrees generally require ZAB recognition." },
      { passport: "cr", note: "Costa Rican citizens need a visa to enter Germany for employment. Same EU Blue Card process and salary thresholds apply. Degree recognition through ZAB is required. No Costa Rica-Germany tax treaty exists." },
    ],
  },
  {
    countrySlug: "germany",
    pathwayKey: "skilled-worker-residence",
    notes: [
      { passport: "us", note: "US citizens can enter Germany visa-free for 90 days but must apply for the residence permit before starting work. Vocational qualifications need formal recognition. US worldwide taxation applies alongside German tax." },
      { passport: "uk", note: "Post-Brexit, UK nationals need this permit like other non-EU citizens. UK vocational qualifications may require recognition through the relevant German professional body." },
      { passport: "ca", note: "Canadian citizens follow the same process. Vocational and professional qualifications require recognition. Canada-Germany tax treaty applies to employment income." },
      { passport: "au", note: "Australian citizens follow the same process. Australian trade qualifications and degrees generally need formal recognition in Germany." },
      { passport: "eu", note: "EU/EEA citizens can work in Germany freely under EU free movement. This permit is for non-EU nationals only. EU professional qualifications are often mutually recognised under EU directives." },
      { passport: "jp", note: "Japanese citizens follow the same application process. Japan-Germany have strong bilateral ties. Qualification recognition is required through the relevant German authority." },
      { passport: "cr", note: "Costa Rican citizens need a work visa. Same qualification recognition and application process as other non-EU nationals. No special bilateral agreement with Germany." },
    ],
  },
  {
    countrySlug: "ireland",
    pathwayKey: "critical-skills",
    notes: [
      { passport: "us", note: "US citizens do not need a visa to enter Ireland (90-day visa-free access) but must obtain the employment permit before starting work. US worldwide taxation applies alongside Irish tax obligations. The US-Ireland tax treaty helps manage double taxation." },
      { passport: "uk", note: "UK citizens can live and work in Ireland under the Common Travel Area (CTA) agreement without needing an employment permit. This pathway is primarily for non-CTA nationals." },
      { passport: "ca", note: "Canadian citizens have 90-day visa-free access to Ireland. Same employment permit process as other non-EEA nationals. The Canada-Ireland tax treaty applies." },
      { passport: "au", note: "Australian citizens have 90-day visa-free access. Same process applies. Australia has a Working Holiday agreement with Ireland for those aged 18-30, which could serve as an initial entry point." },
      { passport: "eu", note: "EU/EEA citizens have the right to live and work in Ireland without any employment permit under EU free movement rules. This pathway is for non-EEA nationals only." },
      { passport: "jp", note: "Japanese citizens have 90-day visa-free access to Ireland. Same employment permit process applies. Japan has a Working Holiday agreement with Ireland for those aged 18-30." },
      { passport: "cr", note: "Costa Rican citizens need a visa to enter Ireland. Same Critical Skills permit process and salary requirements apply. No special bilateral agreement with Ireland." },
    ],
  },
  {
    countrySlug: "ireland",
    pathwayKey: "general-employment",
    notes: [
      { passport: "us", note: "US citizens have 90-day visa-free access but need the employment permit before starting work. The labour market needs test means the employer must demonstrate no suitable EEA candidate was found. US worldwide taxation applies." },
      { passport: "uk", note: "UK citizens can work in Ireland under the Common Travel Area agreement without needing an employment permit. This pathway is for non-CTA nationals." },
      { passport: "ca", note: "Canadian citizens follow the same process. The employer must conduct a labour market needs test. Processing times tend to be longer than for Critical Skills permits." },
      { passport: "au", note: "Australian citizens follow the same process. Consider the Working Holiday visa (if age-eligible) as an alternative entry point before applying for an employment permit." },
      { passport: "eu", note: "EU/EEA citizens can work in Ireland freely without any employment permit. This pathway is for non-EEA nationals only." },
      { passport: "jp", note: "Japanese citizens follow the same process. Consider the Working Holiday agreement with Ireland (ages 18-30) as a potential stepping stone." },
      { passport: "cr", note: "Costa Rican citizens need a visa to enter Ireland and must follow the full General Employment Permit process including the labour market needs test." },
    ],
  },
  {
    countrySlug: "australia",
    pathwayKey: "skilled-independent-189",
    notes: [
      { passport: "us", note: "US citizens follow the same points-based process as all other nationalities. The points test considers age, English proficiency, work experience, and qualifications. US worldwide taxation applies alongside Australian tax obligations - the US-Australia tax treaty helps manage double taxation." },
      { passport: "uk", note: "UK citizens follow the same process. Age, qualifications, and English proficiency are assessed via the points test. The UK-Australia tax treaty applies. UK citizens may also consider the Working Holiday visa (ages 18-30) as an initial entry point." },
      { passport: "ca", note: "Canadian citizens follow the same points-based process. English proficiency requirements are the same (IELTS or equivalent). The Canada-Australia tax treaty covers most income types." },
      { passport: "au", note: "Australian citizens already have the right to live and work in Australia. This visa is for foreign nationals seeking permanent residency." },
      { passport: "eu", note: "EU citizens have no preferential access to Australian immigration and follow the same points-based process as all other foreign nationals. Tax treaty coverage depends on your specific EU member state." },
      { passport: "jp", note: "Japanese citizens follow the same process. Japan has a Working Holiday agreement with Australia (ages 18-30) that can serve as a stepping stone. Japanese qualifications generally need assessment by the relevant Australian authority." },
      { passport: "cr", note: "Costa Rican citizens follow the same points-based process. English proficiency (IELTS or equivalent) is a key component of the points test. Costa Rica has no special bilateral immigration agreement with Australia." },
    ],
  },
  {
    countrySlug: "australia",
    pathwayKey: "skilled-nominated-190",
    notes: [
      { passport: "us", note: "US citizens follow the same process. State nomination adds 5 points to your total. Each state has its own occupation list and requirements. US worldwide taxation applies alongside Australian tax." },
      { passport: "uk", note: "UK citizens follow the same process. State nomination requirements vary. The Working Holiday visa (ages 18-30) can help establish connections in a specific state before applying for nomination." },
      { passport: "ca", note: "Canadian citizens follow the same points-based process. State nomination requires demonstrating commitment to live in that state or territory for at least 2 years." },
      { passport: "au", note: "Australian citizens already have the right to live and work anywhere in Australia. This visa is for foreign nationals seeking permanent residency." },
      { passport: "eu", note: "EU citizens follow the same process as all other foreign nationals. Each Australian state has its own nominated occupation list and eligibility criteria." },
      { passport: "jp", note: "Japanese citizens follow the same process. Japan-Australia Working Holiday agreements can help establish residency in a specific state before seeking nomination." },
      { passport: "cr", note: "Costa Rican citizens follow the same process. State nomination adds 5 points. Research which states have your occupation on their nomination list before applying." },
    ],
  },
];

export function getPassportNotes(countrySlug: string, pathwayKey: string): PassportNote[] {
  const entry = NOTES.find(
    (n) => n.countrySlug === countrySlug && n.pathwayKey === pathwayKey
  );
  return entry?.notes ?? [];
}
