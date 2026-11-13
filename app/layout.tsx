import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Голос из телефона",
  description: "Личный Telegram-собеседник",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#111827", color: "#f9fafb" }}>
        {children}
      </body>
    </html>
  );
}
