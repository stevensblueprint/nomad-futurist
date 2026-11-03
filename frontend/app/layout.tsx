
import type { Metadata } from "next";
import { Albert_Sans, Poppins } from "next/font/google";
import "./globals.css";
import ConfigureAmplify from "./ConfigureAmplify";

const albertSans = Albert_Sans({
  subsets: ["latin"],
  variable: "--font-albert-sans",
  display: "swap",
});

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["600"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Nomad Incubator",
  description: "A Blueprint App",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${albertSans.variable} ${poppins.variable} antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ConfigureAmplify />
        {children}
      </body>
    </html>
  );
}
