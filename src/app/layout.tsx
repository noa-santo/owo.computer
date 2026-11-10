import type {Metadata} from "next";
import {Atkinson_Hyperlegible_Mono} from "next/font/google";
import "./globals.css";
import {SpeedInsights} from "@vercel/speed-insights/next"
import {Analytics} from "@vercel/analytics/react"
import React from "react";

const font = Atkinson_Hyperlegible_Mono({
  variable: "--font",
  preload: true,
  fallback: ["mono"],
  subsets: ['latin']
})

export const metadata: Metadata = {
  title: "OwO",
  description: "UwU",
};

export default function RootLayout({
                                     children,
                                   }: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${font.variable}`}>
        {children}
        <SpeedInsights/>
        <Analytics/>
      </body>
    </html>
  );
}
