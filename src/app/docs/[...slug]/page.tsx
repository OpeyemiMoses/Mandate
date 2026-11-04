import React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsLayout } from "@/components/docs/DocsLayout";
import { ALL_DOC_PAGES, getDocPageBySlug } from "@/lib/docs/docsNavigation";
import { getDocContentBySlug } from "@/lib/docs/allDocsContent";

interface PageProps {
  params: {
    slug: string[];
  };
}

export function generateStaticParams() {
  return ALL_DOC_PAGES.map((page) => ({
    slug: page.slug.split("/"),
  }));
}

export function generateMetadata({ params }: PageProps): Metadata {
  const page = getDocPageBySlug(params.slug);
  if (!page) {
    return {
      title: "Page Not Found | Mandate Documentation",
    };
  }

  return {
    title: `${page.title} — Mandate Public Documentation`,
    description: page.description,
    openGraph: {
      title: `${page.title} | Mandate Docs`,
      description: page.description,
      type: "article",
    },
  };
}

export default function DocSubPage({ params }: PageProps) {
  const slug = params.slug.join("/");
  const pageMeta = getDocPageBySlug(params.slug);
  const pageContent = getDocContentBySlug(params.slug);

  if (!pageMeta || !pageContent) {
    notFound();
  }

  return (
    <DocsLayout activeSlug={slug} headings={pageContent.headings}>
      {pageContent.content}
    </DocsLayout>
  );
}

