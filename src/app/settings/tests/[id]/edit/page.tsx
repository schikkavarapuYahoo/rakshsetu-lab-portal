"use client";

import { ArrowLeft, Sparkles } from "lucide-react";
import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import { use } from "react";
import { toast } from "sonner";

import {
  LabTestForm,
  type LabTestSubmitInput,
} from "@/components/settings/lab-test-form";
import { useLabCatalogStore } from "@/lib/stores/lab-catalog";

export default function EditLabTestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const test = useLabCatalogStore((s) =>
    s.tests.find((t) => t.id === id),
  );
  const updateTest = useLabCatalogStore((s) => s.updateTest);
  const hasHydrated = useLabCatalogStore.persist?.hasHydrated() ?? true;

  if (!hasHydrated) {
    return (
      <div className="mx-auto max-w-5xl">
        <div className="text-muted-foreground text-sm">Loading...</div>
      </div>
    );
  }

  if (!test) notFound();

  // After the notFound guard above, `test` is definitively defined.
  // TS doesn't carry the narrowing through nested closures, so capture
  // a non-null alias once and use it throughout the rest of the file.
  const labTest = test;

  function handleSubmit(input: LabTestSubmitInput) {
    try {
      // Master-derived tests keep their stable `code` since downstream reports
      // already reference it as the test code on the report. We allow renaming,
      // parameter edits and price changes freely.
      const codeChanged =
        labTest.source === "custom" && input.code !== labTest.code;
      const updated = updateTest(labTest.id, {
        name: input.name,
        ...(codeChanged ? { code: input.code } : {}),
        category: input.category,
        description: input.description,
        basePrice: input.basePrice,
        turnaroundMinutes: input.turnaroundMinutes,
        sampleType: input.sampleType,
        tubeColor: input.tubeColor,
        patientPrep: input.patientPrep,
        parameters: input.parameters,
      });
      toast.success(`${updated.name} saved`);
      router.push("/settings/tests");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save test");
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <Link
          href="/settings/tests"
          className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to test catalog
        </Link>
        <div className="flex items-center gap-2">
          <h1 className="text-[28px] font-semibold tracking-tight text-neutral-900">
            Edit {labTest.name}
          </h1>
          {labTest.source === "custom" ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-violet-200 ring-inset">
              <Sparkles className="h-3 w-3" />
              Custom
            </span>
          ) : (
            <span className="inline-flex items-center rounded-md bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600 ring-1 ring-neutral-200 ring-inset">
              From master library
            </span>
          )}
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          Override the reference ranges, units or pricing to match this lab.
          Reports already created with this test keep their original values.
        </p>
      </div>
      <LabTestForm
        submitLabel="Save changes"
        cancelHref="/settings/tests"
        codeLocked={labTest.source === "master"}
        initial={{
          name: labTest.name,
          code: labTest.code,
          category: labTest.category,
          description: labTest.description,
          basePrice: labTest.basePrice,
          turnaroundMinutes: labTest.turnaroundMinutes,
          sampleType: labTest.sampleType,
          tubeColor: labTest.tubeColor,
          patientPrep: labTest.patientPrep,
          parameters: labTest.parameters,
        }}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
