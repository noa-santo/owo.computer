import type { Metadata } from "next";
import { Atkinson_Hyperlegible_Mono } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type React from "react";
import { StateProvider } from "@/app/_components/StateContext";

const font = Atkinson_Hyperlegible_Mono({
	variable: "--font",
	preload: true,
	fallback: ["mono"],
	subsets: ["latin"],
});

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
				<StateProvider>{children}</StateProvider>
				<SpeedInsights />
				<Analytics />
			</body>
		</html>
	);
}
