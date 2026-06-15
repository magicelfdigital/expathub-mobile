import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { shouldSetupQuizReminders } from "@/src/lib/reengagementGates";

// Local re-engagement notifications for users who start the readiness quiz but
// do not finish it. Two reminders are scheduled when the quiz begins (once
// notification permission is granted) and both are cancelled the moment the
// quiz is completed. They share a fixed identifier prefix so they can be found
// and cancelled deterministically, and so they are never duplicated.

const QUIZ_COMPLETED_KEY = "user_quiz_completed";
const QUIZ_REMINDER_ID_PREFIX = "expathub_quiz_reminder";
const NOTIFICATION_TITLE = "ExpatHub";
const HOUR_SECONDS = 60 * 60;

type QuizReminder = {
  id: string;
  hours: number;
  body: string;
};

const QUIZ_REMINDERS: QuizReminder[] = [
  {
    id: `${QUIZ_REMINDER_ID_PREFIX}_24h`,
    hours: 24,
    body: "Your country match is waiting — takes 2 minutes to find out where you belong.",
  },
  {
    id: `${QUIZ_REMINDER_ID_PREFIX}_72h`,
    hours: 72,
    body: "Still figuring out where to go? Your readiness score takes 2 minutes.",
  },
];

let handlerConfigured = false;

// Controls how a notification is presented while the app is foregrounded.
export function configureNotificationHandler(): void {
  if (handlerConfigured || Platform.OS === "web") return;
  handlerConfigured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

// Requests notification permission using Expo's flow. Called when the quiz
// starts, never on cold open. Returns true only when permission is granted.
export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (current.status === "denied" && !current.canAskAgain) return false;
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch {
    return false;
  }
}

// Schedules the 24h and 72h reminders if they are not already scheduled and the
// quiz has not been completed. Best-effort: any failure is swallowed so it can
// never interrupt the quiz flow.
export async function scheduleQuizReminders(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const completed = await AsyncStorage.getItem(QUIZ_COMPLETED_KEY);
    if (completed === "true") return;

    configureNotificationHandler();

    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const existing = new Set(scheduled.map((n) => n.identifier));

    for (const reminder of QUIZ_REMINDERS) {
      if (existing.has(reminder.id)) continue;
      await Notifications.scheduleNotificationAsync({
        identifier: reminder.id,
        content: { title: NOTIFICATION_TITLE, body: reminder.body },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: reminder.hours * HOUR_SECONDS,
          repeats: false,
        },
      });
    }
  } catch {
    // Best effort; scheduling failures must not surface to the user.
  }
}

// Called when the quiz starts. Skips users who have already completed the quiz
// (so revisiting or editing a finished quiz never prompts), then requests
// permission and, if granted, schedules the reminders. Best-effort throughout.
export async function setupQuizRemindersOnStart(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const completed = (await AsyncStorage.getItem(QUIZ_COMPLETED_KEY)) === "true";
    if (!shouldSetupQuizReminders(completed)) return;

    const granted = await requestNotificationPermission();
    if (granted) await scheduleQuizReminders();
  } catch {
    // Best effort; setup failures must not surface to the user.
  }
}

// Cancels both reminders. Called when the quiz is completed.
export async function cancelQuizReminders(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await Promise.all(
      QUIZ_REMINDERS.map((reminder) =>
        Notifications.cancelScheduledNotificationAsync(reminder.id)
      )
    );
  } catch {
    // Best effort.
  }
}
