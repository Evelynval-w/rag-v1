import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";

export const metadata = {
  title: "RAG V2",
  description:
    "RAG web app over two corpora (Kestrel KB + EPITA course notes), with retrieval evaluation and words analytics",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="topnav">
          <Link href="/">Ask</Link>
          <Link href="/docs">Documents</Link>
          <Link href="/words">Words</Link>
          <Link href="/eval">Evaluation</Link>
          <Link href="/settings">Settings</Link>
        </nav>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
