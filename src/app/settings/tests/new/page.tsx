"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  LabTestForm,
  type LabTestSubmitInput,
} from "@/components/settings/lab-test-form";
import { useLabCatalogStore } from "@/lib/stores/lab-catalog";

export default function NewCustomTestPage() {
  const router = useRouter();
  const addCustomTest = useLabCatalogStore((s) => s.addCustomTest);

  function handleSubmit(input: LabTestSubmitInput) {
    try {
      const test = addCustomTest({
        name: input.name,
        code: input.code,
        category: input.category,
        description: input.description,
        basePrice: input.basePrice,
        turnaroundMinutes: input.turnaroundMinutes,
        sampleType: input.sampleType,
        tubeColor: input.tubeColor,
        patientPrep: input.patientPrep,
        parameters: input.parameters,
      });
      toast.success(`${test.name} added to your catalog`);
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
        <h1 className="text-[28px] font-semibold tracking-tight text-neutral-900">
          Custom test
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Use this for tests not in the master library — regional specialties,
          private packages, or any test your lab runs in-house.
        </p>
      </div>
      <LabTestForm
        submitLabel="Create test"
        cancelHref="/settings/tests"
        onSubmit={handleSubmit}
      />
    </div>
  );
}
