import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dance MVP",
  description: "Upload or generate songs, then dance and score.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
