import type { Metadata } from "next";
import { Albert_Sans, Poppins } from "next/font/google";
import "./globals.css";
import ConfigureAmplify from "./ConfigureAmplify";

const albertSans = Albert_Sans({
  subsets: ["latin"],
  variable: "--next-albert",
  display: "swap",
});

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--next-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Nomad Incubator",
  description: "A Blueprint App",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${albertSans.variable} ${poppins.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <ConfigureAmplify />
        {children}
      </body>
    </html>
  );
}