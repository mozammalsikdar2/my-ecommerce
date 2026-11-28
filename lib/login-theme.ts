import type { CSSProperties } from "react";
import type { LoginSettings } from "@/types/login-settings";

export function loginBackgroundStyle(settings: LoginSettings): CSSProperties {
  const background = settings.loginBgImageUrl
    ? `linear-gradient(rgba(1, 15, 11, 0.6), rgba(1, 15, 11, 0.6)), url(${JSON.stringify(settings.loginBgImageUrl)})`
    : `linear-gradient(125deg, transparent 28%, ${settings.loginGoldColor}55 34%, transparent 41%), linear-gradient(145deg, transparent 42%, ${settings.loginEmeraldColor}bb 50%, transparent 59%), radial-gradient(ellipse at 15% 15%, ${settings.loginEmeraldColor} 0%, transparent 52%), linear-gradient(135deg, #041b14, #08110e)`;
  return {
    backgroundImage: background,
    backgroundSize: "cover",
    backgroundPosition: "center",
  };
}

export function loginCardStyle(settings: LoginSettings): CSSProperties {
  return {
    backgroundColor: `rgba(3, 16, 12, ${settings.loginCardOpacity / 100})`,
    borderColor: settings.loginGoldColor,
  };
}
