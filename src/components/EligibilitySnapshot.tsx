import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { tokens } from "@/theme/tokens";
import { trackEvent } from "@/src/lib/analytics";

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

type ResultType = "viable" | "review" | null;

function computeResult(
  nationality: string | null,
  income: string | null,
  savings: string | null,
  employment: string | null,
): ResultType {
  if (!nationality || !income || !savings || !employment) return null;

  const incomeIndex = INCOME_BRACKETS.indexOf(income);
  const savingsIndex = SAVINGS_BRACKETS.indexOf(savings);

  if (incomeIndex >= 2 && savingsIndex >= 2) {
    return "viable";
  }

  return "review";
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
  const [result, setResult] = useState<ResultType>(null);
  const [hasRun, setHasRun] = useState(false);

  const allFilled = !!nationality && !!income && !!savings && !!employment;

  const handleRun = () => {
    const computed = computeResult(nationality, income, savings, employment);
    setResult(computed);
    setHasRun(true);
    trackEvent("eligibility_snapshot_run", {
      country: countrySlug,
      pathway: pathwayId ?? "",
      result: computed ?? "incomplete",
    });
  };

  const handleReset = () => {
    setNationality(null);
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
          Your answers are stored only on your device and are not shared.
        </Text>
      </View>

      {!hasRun ? (
        <>
          <DropdownSelect
            label="Passport Nationality"
            options={NATIONALITIES}
            value={nationality}
            onSelect={setNationality}
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
      ) : (
        <View style={styles.resultContainer}>
          {result === "viable" ? (
            <View style={styles.resultCard}>
              <View style={styles.resultIconRow}>
                <Ionicons name="checkmark-circle" size={24} color="#2E7D32" />
                <Text style={styles.resultTitle}>Looks viable</Text>
              </View>
              <Text style={styles.resultBody}>
                Based on what you've shared, this pathway appears to be a reasonable fit. We recommend reviewing the detailed requirements to confirm.
              </Text>
            </View>
          ) : (
            <View style={[styles.resultCard, styles.resultCardReview]}>
              <View style={styles.resultIconRow}>
                <Ionicons name="alert-circle" size={24} color="#E65100" />
                <Text style={styles.resultTitle}>May work, needs review</Text>
              </View>
              <Text style={styles.resultBody}>
                Some aspects of your situation may need closer review against the specific requirements of this pathway. Consider consulting a specialist.
              </Text>
            </View>
          )}

          <Pressable style={styles.resetButton} onPress={handleReset}>
            <Ionicons name="refresh-outline" size={16} color={tokens.color.primary} />
            <Text style={styles.resetText}>Run again with different inputs</Text>
          </Pressable>
        </View>
      )}
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
  resultCardReview: {
    backgroundColor: "rgba(230, 81, 0, 0.08)",
    borderColor: "rgba(230, 81, 0, 0.2)",
  },
  resultIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  resultTitle: {
    fontSize: tokens.text.h3,
    fontWeight: tokens.weight.bold,
    color: tokens.color.text,
  },
  resultBody: {
    fontSize: tokens.text.body,
    color: tokens.color.subtext,
    lineHeight: 20,
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
