import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { tokens } from "@/theme/tokens";
import { trackEvent } from "@/src/lib/analytics";

const PASSPORT_STORAGE_KEY = "expathub_passport_nationality";

const NATIONALITIES = [
  "US / Canada",
  "UK / Ireland",
  "EU / EEA",
  "Australia / NZ",
  "Other",
];

const INCOME_BRACKETS = [
  "Under $1,500/mo",
  "$1,500 - $3,000/mo",
  "$3,000 - $5,000/mo",
  "$5,000 - $10,000/mo",
  "Over $10,000/mo",
];

const SAVINGS_BRACKETS = [
  "Under $5,000",
  "$5,000 - $15,000",
  "$15,000 - $30,000",
  "$30,000 - $60,000",
  "Over $60,000",
];

const EMPLOYMENT_TYPES = [
  "Remote employee",
  "Freelancer / self-employed",
  "Business owner",
  "Retired / pension",
  "Student",
  "Other",
];

type PathwayThreshold = {
  minimumIncomeIndex: number;
  minimumSavingsIndex: number;
  allowedEmployment?: string[];
  excludedPassports?: string[];
  notes?: string;
};

const PATHWAY_THRESHOLDS: Record<string, PathwayThreshold> = {
  d7: {
    minimumIncomeIndex: 1,
    minimumSavingsIndex: 1,
    allowedEmployment: ["Retired / pension", "Freelancer / self-employed", "Business owner", "Other"],
    notes: "D7 requires passive income — active employment typically does not qualify.",
  },
  d8: {
    minimumIncomeIndex: 2,
    minimumSavingsIndex: 1,
    allowedEmployment: ["Remote employee", "Freelancer / self-employed", "Business owner"],
    excludedPassports: ["EU / EEA"],
    notes: "D8 requires remote work income from outside Portugal.",
  },
  nlv: {
    minimumIncomeIndex: 2,
    minimumSavingsIndex: 2,
    allowedEmployment: ["Retired / pension", "Other"],
    excludedPassports: ["EU / EEA"],
    notes: "Non-Lucrative Visa prohibits all work, including remote work.",
  },
  dnv: {
    minimumIncomeIndex: 2,
    minimumSavingsIndex: 1,
    allowedEmployment: ["Remote employee", "Freelancer / self-employed", "Business owner"],
    excludedPassports: ["EU / EEA"],
  },
  "elective-residency": {
    minimumIncomeIndex: 2,
    minimumSavingsIndex: 2,
    allowedEmployment: ["Retired / pension", "Other"],
    excludedPassports: ["EU / EEA"],
    notes: "Elective Residency does not permit employment in Italy.",
  },
  "talent-passport": {
    minimumIncomeIndex: 2,
    minimumSavingsIndex: 1,
    allowedEmployment: ["Remote employee", "Freelancer / self-employed", "Business owner"],
  },
  visitor: {
    minimumIncomeIndex: 1,
    minimumSavingsIndex: 2,
    allowedEmployment: ["Retired / pension", "Other"],
    notes: "Long-stay visitor visa does not permit employment.",
  },
  "express-entry": {
    minimumIncomeIndex: 2,
    minimumSavingsIndex: 2,
    allowedEmployment: ["Remote employee", "Freelancer / self-employed", "Business owner"],
  },
  "skilled-worker": {
    minimumIncomeIndex: 1,
    minimumSavingsIndex: 1,
    allowedEmployment: ["Remote employee"],
  },
  "global-talent": {
    minimumIncomeIndex: 2,
    minimumSavingsIndex: 1,
    allowedEmployment: ["Remote employee", "Freelancer / self-employed", "Business owner"],
  },
  "innovator-founder": {
    minimumIncomeIndex: 3,
    minimumSavingsIndex: 3,
    allowedEmployment: ["Business owner", "Freelancer / self-employed"],
  },
  grp: {
    minimumIncomeIndex: 2,
    minimumSavingsIndex: 2,
    excludedPassports: ["EU / EEA"],
  },
  "digital-nomad": {
    minimumIncomeIndex: 2,
    minimumSavingsIndex: 1,
    allowedEmployment: ["Remote employee", "Freelancer / self-employed", "Business owner"],
  },
  retirement: {
    minimumIncomeIndex: 1,
    minimumSavingsIndex: 2,
    allowedEmployment: ["Retired / pension"],
  },
  pensionado: {
    minimumIncomeIndex: 1,
    minimumSavingsIndex: 2,
    allowedEmployment: ["Retired / pension"],
  },
  jubilado: {
    minimumIncomeIndex: 1,
    minimumSavingsIndex: 2,
    allowedEmployment: ["Retired / pension"],
  },
  rentista: {
    minimumIncomeIndex: 2,
    minimumSavingsIndex: 2,
    allowedEmployment: ["Retired / pension", "Freelancer / self-employed", "Business owner", "Other"],
    notes: "Rentista typically requires proof of stable income or financial means.",
  },
  "self-economic-solvency": {
    minimumIncomeIndex: 2,
    minimumSavingsIndex: 2,
  },
  "friendly-nations": {
    minimumIncomeIndex: 1,
    minimumSavingsIndex: 1,
  },
  "temporary-resident": {
    minimumIncomeIndex: 1,
    minimumSavingsIndex: 1,
  },
  "permanent-resident": {
    minimumIncomeIndex: 2,
    minimumSavingsIndex: 2,
  },
  ltr: {
    minimumIncomeIndex: 3,
    minimumSavingsIndex: 2,
    allowedEmployment: ["Remote employee", "Freelancer / self-employed", "Business owner", "Retired / pension"],
  },
  student: {
    minimumIncomeIndex: 0,
    minimumSavingsIndex: 1,
    allowedEmployment: ["Student"],
  },
};

const DEFAULT_THRESHOLD: PathwayThreshold = {
  minimumIncomeIndex: 2,
  minimumSavingsIndex: 2,
};

type EligibilityResult = {
  alignmentLevel: "strong" | "moderate";
  strengths: string[];
  cautions: string[];
  info: string[];
};

function computeResult(
  nationality: string,
  income: string,
  savings: string,
  employment: string,
  pathwayId: string,
): EligibilityResult {
  const thresholds = PATHWAY_THRESHOLDS[pathwayId] ?? DEFAULT_THRESHOLD;
  const incomeIndex = INCOME_BRACKETS.indexOf(income);
  const savingsIndex = SAVINGS_BRACKETS.indexOf(savings);

  const strengths: string[] = [];
  const cautions: string[] = [];
  const info: string[] = [];

  if (incomeIndex >= thresholds.minimumIncomeIndex) {
    strengths.push("Income bracket appears to meet typical thresholds for this pathway.");
  } else {
    cautions.push("Income may fall below the typical threshold for this pathway.");
  }

  if (savingsIndex >= thresholds.minimumSavingsIndex) {
    strengths.push("Savings bracket appears sufficient for application and initial costs.");
  } else {
    cautions.push("Savings may be lower than typically expected for this pathway.");
  }

  if (thresholds.excludedPassports?.includes(nationality)) {
    cautions.push("This pathway is generally designed for non-EU nationals. EU/EEA citizens may have simpler options available.");
  } else {
    strengths.push("Your passport nationality is generally eligible for this pathway type.");
  }

  if (thresholds.allowedEmployment) {
    if (thresholds.allowedEmployment.includes(employment)) {
      strengths.push("Your employment type aligns with the typical requirements.");
    } else {
      cautions.push("This pathway may not be the best fit for your employment type.");
    }
  } else {
    strengths.push("Employment type does not appear to be a limiting factor.");
  }

  if (thresholds.notes) {
    info.push(thresholds.notes);
  }

  const alignmentLevel = cautions.length <= 1 ? "strong" : "moderate";

  return { alignmentLevel, strengths, cautions, info };
}

function DropdownSelect({
  label,
  options,
  value,
  onSelect,
}: {
  label: string;
  options: string[];
  value: string | null;
  onSelect: (val: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <View style={dropStyles.container}>
      <Text style={dropStyles.label}>{label}</Text>
      <Pressable
        style={[dropStyles.trigger, open && dropStyles.triggerActive]}
        onPress={() => setOpen(!open)}
      >
        <Text style={[dropStyles.triggerText, !value && dropStyles.placeholder]}>
          {value ?? "Select..."}
        </Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={16}
          color={tokens.color.subtext}
        />
      </Pressable>
      {open && (
        <View style={dropStyles.menu}>
          {options.map((opt) => (
            <Pressable
              key={opt}
              style={[dropStyles.option, value === opt && dropStyles.optionActive]}
              onPress={() => {
                onSelect(opt);
                setOpen(false);
              }}
            >
              <Text
                style={[
                  dropStyles.optionText,
                  value === opt && dropStyles.optionTextActive,
                ]}
              >
                {opt}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const dropStyles = StyleSheet.create({
  container: { marginBottom: tokens.space.md },
  label: {
    fontSize: tokens.text.small,
    color: tokens.color.subtext,
    marginBottom: 4,
    fontWeight: tokens.weight.bold,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm + 2,
    backgroundColor: tokens.color.surface,
  },
  triggerActive: {
    borderColor: tokens.color.primary,
  },
  triggerText: {
    fontSize: tokens.text.body,
    color: tokens.color.text,
    flex: 1,
  },
  placeholder: {
    color: tokens.color.subtext,
  },
  menu: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.color.surface,
    overflow: "hidden" as const,
  },
  option: {
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm,
  },
  optionActive: {
    backgroundColor: tokens.color.primarySoft,
  },
  optionText: {
    fontSize: tokens.text.body,
    color: tokens.color.text,
  },
  optionTextActive: {
    color: tokens.color.primary,
    fontWeight: tokens.weight.bold,
  },
});

interface EligibilitySnapshotProps {
  countrySlug: string;
  pathwayId?: string;
}

export default function EligibilitySnapshot({
  countrySlug,
  pathwayId,
}: EligibilitySnapshotProps) {
  const [nationality, setNationality] = useState<string | null>(null);
  const [income, setIncome] = useState<string | null>(null);
  const [savings, setSavings] = useState<string | null>(null);
  const [employment, setEmployment] = useState<string | null>(null);
  const [result, setResult] = useState<EligibilityResult | null>(null);
  const [hasRun, setHasRun] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(PASSPORT_STORAGE_KEY).then((stored) => {
      if (stored && NATIONALITIES.includes(stored)) {
        setNationality(stored);
      }
    });
  }, []);

  const handleNationalityChange = (val: string) => {
    setNationality(val);
    AsyncStorage.setItem(PASSPORT_STORAGE_KEY, val);
  };

  const allFilled = !!nationality && !!income && !!savings && !!employment;

  const handleRun = () => {
    if (!allFilled) return;
    const computed = computeResult(nationality, income, savings, employment, pathwayId ?? "");
    setResult(computed);
    setHasRun(true);
    trackEvent("eligibility_snapshot_run", {
      country: countrySlug,
      pathway: pathwayId ?? "",
      result: computed.alignmentLevel,
    });
  };

  const handleReset = () => {
    setIncome(null);
    setSavings(null);
    setEmployment(null);
    setResult(null);
    setHasRun(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="shield-checkmark-outline" size={20} color={tokens.color.primary} />
        <Text style={styles.title}>Eligibility Snapshot</Text>
      </View>

      <View style={styles.privacyNote}>
        <Ionicons name="lock-closed-outline" size={14} color={tokens.color.subtext} />
        <Text style={styles.privacyText}>
          Stored only on your device and not shared.
        </Text>
      </View>

      {!hasRun ? (
        <>
          <DropdownSelect
            label="Passport Nationality"
            options={NATIONALITIES}
            value={nationality}
            onSelect={handleNationalityChange}
          />
          <DropdownSelect
            label="Monthly Income"
            options={INCOME_BRACKETS}
            value={income}
            onSelect={setIncome}
          />
          <DropdownSelect
            label="Available Savings"
            options={SAVINGS_BRACKETS}
            value={savings}
            onSelect={setSavings}
          />
          <DropdownSelect
            label="Employment Type"
            options={EMPLOYMENT_TYPES}
            value={employment}
            onSelect={setEmployment}
          />

          <Pressable
            style={[styles.runButton, !allFilled && styles.runButtonDisabled]}
            onPress={handleRun}
            disabled={!allFilled}
          >
            <Ionicons
              name="checkmark-circle-outline"
              size={18}
              color={allFilled ? tokens.color.white : tokens.color.subtext}
            />
            <Text
              style={[
                styles.runButtonText,
                !allFilled && styles.runButtonTextDisabled,
              ]}
            >
              Check Eligibility
            </Text>
          </Pressable>
        </>
      ) : result ? (
        <View style={styles.resultContainer}>
          <View
            style={[
              styles.resultCard,
              result.alignmentLevel === "moderate" && styles.resultCardModerate,
            ]}
          >
            <View style={styles.resultIconRow}>
              <Ionicons
                name={result.alignmentLevel === "strong" ? "checkmark-circle" : "alert-circle"}
                size={24}
                color={result.alignmentLevel === "strong" ? "#2E7D32" : "#E65100"}
              />
              <Text style={styles.resultTitle}>
                {result.alignmentLevel === "strong"
                  ? "This pathway appears viable based on your inputs."
                  : "This pathway may work, but a few areas need review."}
              </Text>
            </View>
          </View>

          {result.strengths.length > 0 ? (
            <View style={styles.findingsSection}>
              {result.strengths.map((s, i) => (
                <View key={`s-${i}`} style={styles.findingRow}>
                  <Ionicons name="checkmark-circle" size={16} color="#2E7D32" />
                  <Text style={styles.findingText}>{s}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {result.cautions.length > 0 ? (
            <View style={styles.findingsSection}>
              {result.cautions.map((c, i) => (
                <View key={`c-${i}`} style={styles.findingRow}>
                  <Ionicons name="information-circle" size={16} color="#E65100" />
                  <Text style={styles.findingText}>{c}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {result.info.length > 0 ? (
            <View style={styles.findingsSection}>
              {result.info.map((n, i) => (
                <View key={`n-${i}`} style={styles.findingRow}>
                  <Ionicons name="bulb-outline" size={16} color={tokens.color.subtext} />
                  <Text style={styles.findingTextMuted}>{n}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <Text style={styles.disclaimer}>
            This is a general indication only. Always verify specific requirements with the relevant consulate or immigration authority.
          </Text>

          <Pressable style={styles.resetButton} onPress={handleReset}>
            <Ionicons name="refresh-outline" size={16} color={tokens.color.primary} />
            <Text style={styles.resetText}>Run again with different inputs</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: tokens.space.lg,
    marginTop: tokens.space.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: tokens.space.sm,
  },
  title: {
    fontSize: tokens.text.h3,
    fontWeight: tokens.weight.bold,
    color: tokens.color.text,
  },
  privacyNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: tokens.color.primarySoft,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.space.sm,
    paddingVertical: tokens.space.xs,
    marginBottom: tokens.space.lg,
  },
  privacyText: {
    fontSize: tokens.text.small,
    color: tokens.color.subtext,
    flex: 1,
  },
  runButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: tokens.color.primary,
    borderRadius: tokens.radius.sm,
    paddingVertical: tokens.space.sm + 2,
    marginTop: tokens.space.xs,
  },
  runButtonDisabled: {
    backgroundColor: tokens.color.border,
  },
  runButtonText: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.bold,
    color: tokens.color.white,
  },
  runButtonTextDisabled: {
    color: tokens.color.subtext,
  },
  resultContainer: {
    gap: tokens.space.md,
  },
  resultCard: {
    backgroundColor: "rgba(46, 125, 50, 0.08)",
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: "rgba(46, 125, 50, 0.2)",
    padding: tokens.space.md,
  },
  resultCardModerate: {
    backgroundColor: "rgba(230, 81, 0, 0.08)",
    borderColor: "rgba(230, 81, 0, 0.2)",
  },
  resultIconRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  resultTitle: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.bold,
    color: tokens.color.text,
    flex: 1,
    lineHeight: 20,
  },
  findingsSection: {
    gap: tokens.space.xs + 2,
  },
  findingRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  findingText: {
    fontSize: tokens.text.body,
    color: tokens.color.text,
    flex: 1,
    lineHeight: 20,
  },
  findingTextMuted: {
    fontSize: tokens.text.small,
    color: tokens.color.subtext,
    flex: 1,
    lineHeight: 18,
    fontStyle: "italic" as const,
  },
  disclaimer: {
    fontSize: tokens.text.small,
    color: tokens.color.subtext,
    lineHeight: 16,
  },
  resetButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  resetText: {
    fontSize: tokens.text.small,
    color: tokens.color.primary,
    fontWeight: tokens.weight.bold,
  },
});
