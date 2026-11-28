import type { Messages } from "../types";

export const email: Messages["email"] = {
  confirmSubject: "Please confirm your subscription to {site}",
  confirmText:
    "Hello!\n\nSomeone (hopefully you) subscribed this address to new tutorial updates from {site}. Open the link below to confirm:\n\n{url}\n\nIf this wasn't you, just ignore this email — you won't hear from us again.",
  confirmHeading: "Confirm your subscription",
  confirmBody: "Someone (hopefully you) subscribed this address to new tutorial updates from {site}. Click the button below to confirm; we'll email you whenever a new tutorial is published.",
  confirmButton: "Confirm subscription",
  confirmFooter: "If this wasn't you, just ignore this email — you won't hear from us again.",
  newSubject: "New tutorial: {title}",
  newIntro: "{site} just published a new tutorial:",
  newReadMore: "Read it: {url}",
  newUnsubscribe: "Don't want these emails? Unsubscribe: {url}",
  newLabel: "New tutorial",
  newButton: "Read the tutorial",
  newFooter: "You're receiving this because you subscribed to new tutorial updates from {site}. {link}",
  unsubscribeLink: "Unsubscribe",
  invalidEmail: "That email address doesn't look right",
  subscribeDisabled: "Email subscriptions aren't enabled yet",
  tooFrequent: "Too many requests, please try again later",
  sendFailed: "We couldn't send the confirmation email, please try again later",
  humanCheckFailed: "The human verification didn't pass, please verify again and resubmit",
  unsubscribed: "Unsubscribed",
  invalidLink: "Invalid link",
};
