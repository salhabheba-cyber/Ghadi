"use client";
import { use } from "react";
import { ReaderScreen } from "@/components/read/reader/reader";

export default function ReaderPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  return <ReaderScreen slug={slug} />;
}
