import { z } from "zod";

const text = z.string().trim().min(1).max(500);
const color = z.string().regex(/^#[\da-f]{6}$/i);
const imageUrl = z.string().trim().max(2048).refine((value) => {
  if (value === "") return true;
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) {
    return true;
  }
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}, "Image URL must be root-relative or use HTTP(S)");

export const loginSettingsSchema = z.object({
  loginBgImageUrl: imageUrl,
  loginGoldColor: color,
  loginEmeraldColor: color,
  loginCardOpacity: z.number().int().min(30).max(90),
  adminLoginBackText: text,
  adminLoginBadgeText: text,
  adminLoginEyebrow: text,
  adminLoginTitle: text,
  adminLoginSubtitle: text,
  adminEmailLabel: text,
  adminEmailPlaceholder: text,
  adminPasswordLabel: text,
  adminForgotText: text,
  adminButtonText: text,
  adminSwitchPrompt: text,
  adminSwitchLinkText: text,
  showAdminUserSwitchLink: z.boolean(),
  userLoginBackText: text,
  userLoginBadgeText: text,
  userLoginEyebrow: text,
  userLoginTitle: text,
  userLoginSubtitle: text,
  userRegisterTitle: text,
  userRegisterSubtitle: text,
  userEmailLabel: text,
  userEmailPlaceholder: text,
  userPasswordLabel: text,
  userForgotText: text,
  userButtonText: text,
  userRegisterButtonText: text,
  userRegistrationEnabled: z.boolean(),
  userSwitchPrompt: text,
  userSwitchLinkText: text,
  showUserAdminSwitchLink: z.boolean(),
});

export type LoginSettings = z.infer<typeof loginSettingsSchema>;

export const defaultLoginSettings: LoginSettings = {
  loginBgImageUrl: "",
  loginGoldColor: "#E5B842",
  loginEmeraldColor: "#117A5B",
  loginCardOpacity: 62,
  adminLoginBackText: "Back to ALIF STORE",
  adminLoginBadgeText: "SECURE ACCESS • SSL Encrypted Session",
  adminLoginEyebrow: "RESTRICTED ACCESS",
  adminLoginTitle: "Admin Login Dashboard",
  adminLoginSubtitle: "Sign in with your Administrator or Moderator credentials to manage products, orders, payments, and site settings.",
  adminEmailLabel: "Admin Email Address",
  adminEmailPlaceholder: "admin@example.com",
  adminPasswordLabel: "Password",
  adminForgotText: "Forgot Password?",
  adminButtonText: "Access Admin Dashboard",
  adminSwitchPrompt: "Shopping as a customer?",
  adminSwitchLinkText: "Go to User Login",
  showAdminUserSwitchLink: true,
  userLoginBackText: "Back to ALIF STORE",
  userLoginBadgeText: "CUSTOMER PORTAL • SSL Encrypted Session",
  userLoginEyebrow: "MEMBER ACCESS",
  userLoginTitle: "Customer Login",
  userLoginSubtitle: "Sign in to track your orders, manage saved delivery addresses, and access your wishlist.",
  userRegisterTitle: "Create Customer Account",
  userRegisterSubtitle: "Register now for faster checkout, order tracking, and exclusive member discounts.",
  userEmailLabel: "Email Address",
  userEmailPlaceholder: "you@example.com",
  userPasswordLabel: "Password",
  userForgotText: "Forgot Password?",
  userButtonText: "Sign In to Account",
  userRegisterButtonText: "Create Account",
  userRegistrationEnabled: true,
  userSwitchPrompt: "Store administrator?",
  userSwitchLinkText: "Admin Login",
  showUserAdminSwitchLink: false,
};
