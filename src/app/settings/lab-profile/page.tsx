"use client";

import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { OutlinedInput } from "@/components/ui/outlined-input";
import { OutlinedTextarea } from "@/components/ui/outlined-textarea";
import { useLabProfileStore } from "@/lib/stores/lab-profile";

export default function LabProfileSettingsPage() {
  const profile = useLabProfileStore((s) => s.profile);
  const updateProfile = useLabProfileStore((s) => s.updateProfile);
  const hasHydrated = useLabProfileStore.persist?.hasHydrated() ?? true;

  const [labName, setLabName] = useState(profile.labName);
  const [address, setAddress] = useState(profile.address);
  const [phone, setPhone] = useState(profile.phone);
  const [email, setEmail] = useState(profile.email);
  const [logoUrl, setLogoUrl] = useState(profile.logoUrl);
  const [signatoryName, setSignatoryName] = useState(profile.signatoryName);
  const [signatoryRole, setSignatoryRole] = useState(profile.signatoryRole);
  const [nablNumber, setNablNumber] = useState(profile.nablNumber);
  const [licenseNumber, setLicenseNumber] = useState(profile.licenseNumber);
  const [gstin, setGstin] = useState(profile.gstin);
  const [whatsappBusinessNumber, setWhatsappBusinessNumber] = useState(
    profile.whatsappBusinessNumber,
  );
  const [whatsappTemplate, setWhatsappTemplate] = useState(
    profile.whatsappTemplate,
  );

  // Hydration: zustand persist re-reads from localStorage after the first
  // client paint, so re-seed local state once the canonical values arrive.
  useEffect(() => {
    if (!hasHydrated) return;
    setLabName(profile.labName);
    setAddress(profile.address);
    setPhone(profile.phone);
    setEmail(profile.email);
    setLogoUrl(profile.logoUrl);
    setSignatoryName(profile.signatoryName);
    setSignatoryRole(profile.signatoryRole);
    setNablNumber(profile.nablNumber);
    setLicenseNumber(profile.licenseNumber);
    setGstin(profile.gstin);
    setWhatsappBusinessNumber(profile.whatsappBusinessNumber);
    setWhatsappTemplate(profile.whatsappTemplate);
  }, [hasHydrated, profile]);

  function handleSave() {
    updateProfile({
      labName: labName.trim(),
      address: address.trim(),
      phone: phone.trim(),
      email: email.trim(),
      logoUrl: logoUrl.trim(),
      signatoryName: signatoryName.trim(),
      signatoryRole: signatoryRole.trim(),
      nablNumber: nablNumber.trim(),
      licenseNumber: licenseNumber.trim(),
      gstin: gstin.trim().toUpperCase(),
      whatsappBusinessNumber: whatsappBusinessNumber.trim(),
      whatsappTemplate: whatsappTemplate.trim(),
    });
    toast.success("Lab profile saved");
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-8">
      <Link
        href="/settings"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to settings
      </Link>

      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Lab profile</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Shown on every printed / PDF report. Configure this once before
          handing reports to patients.
        </p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSave();
        }}
        className="space-y-6"
      >
        <section className="space-y-4 rounded-lg border border-neutral-200 bg-white p-5">
          <h2 className="text-sm font-semibold tracking-wide text-neutral-500 uppercase">
            Letterhead
          </h2>
          <OutlinedInput
            label="Lab name"
            value={labName}
            onChange={(e) => setLabName(e.target.value)}
            required
            helperText="Appears in large type at the top of every report."
          />
          <OutlinedTextarea
            label="Address"
            rows={2}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <OutlinedInput
              label="Phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <OutlinedInput
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <OutlinedInput
            label="Logo URL (optional)"
            type="url"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            helperText="Paste a hosted image URL. Leave blank for a coloured placeholder with the lab's initial."
          />
        </section>

        <section className="space-y-4 rounded-lg border border-neutral-200 bg-white p-5">
          <div>
            <h2 className="text-sm font-semibold tracking-wide text-neutral-500 uppercase">
              Accreditation &amp; registration
            </h2>
            <p className="text-muted-foreground mt-1 text-xs">
              Printed in a small strip below the lab name on every report so
              doctors can independently verify accreditation. Leave blank
              for any that don&apos;t apply.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <OutlinedInput
              label="NABL accreditation no."
              value={nablNumber}
              onChange={(e) => setNablNumber(e.target.value)}
              helperText='e.g. "M-12345"'
            />
            <OutlinedInput
              label="Lab license / registration no."
              value={licenseNumber}
              onChange={(e) => setLicenseNumber(e.target.value)}
              helperText="Clinical Establishment / state-issued license."
            />
          </div>
          <OutlinedInput
            label="GSTIN (optional)"
            value={gstin}
            onChange={(e) => setGstin(e.target.value)}
            helperText="15-character GSTIN. Required if you cross the GST threshold."
          />
        </section>

        <section className="space-y-4 rounded-lg border border-neutral-200 bg-white p-5">
          <div>
            <h2 className="text-sm font-semibold tracking-wide text-neutral-500 uppercase">
              Signatory
            </h2>
            <p className="text-muted-foreground mt-1 text-xs">
              Name shown above the signature line in the report footer.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <OutlinedInput
              label="Signatory name"
              value={signatoryName}
              onChange={(e) => setSignatoryName(e.target.value)}
            />
            <OutlinedInput
              label="Role / qualification"
              value={signatoryRole}
              onChange={(e) => setSignatoryRole(e.target.value)}
              helperText='e.g. "Pathologist", "Lab In-Charge"'
            />
          </div>
        </section>

        <section className="space-y-4 rounded-lg border border-neutral-200 bg-white p-5">
          <div>
            <h2 className="text-sm font-semibold tracking-wide text-neutral-500 uppercase">
              WhatsApp delivery
            </h2>
            <p className="text-muted-foreground mt-1 text-xs">
              Used when &ldquo;Send to patient&rdquo; → WhatsApp is chosen on a
              published report. Demo mode is active until a real
              WhatsApp Business provider (Twilio / Gupshup / WhatsApp
              Cloud API) is wired up — sends are stamped for audit but
              no message is actually delivered yet.
            </p>
          </div>
          <OutlinedInput
            label="WhatsApp Business number"
            type="tel"
            value={whatsappBusinessNumber}
            onChange={(e) => setWhatsappBusinessNumber(e.target.value)}
            helperText='Include country code, e.g. "+91 98765 43210". The number registered with your WhatsApp Business provider.'
          />
          <OutlinedTextarea
            label="Message template"
            rows={5}
            value={whatsappTemplate}
            onChange={(e) => setWhatsappTemplate(e.target.value)}
            helperText="Tokens: {{patientName}} {{labName}} {{reportCode}} {{testName}} {{reportLink}} {{signatoryName}}. Leave blank to use the built-in default."
          />
        </section>

        <div className="flex items-center justify-end gap-2">
          <Link
            href="/settings"
            className="inline-flex h-10 items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-4 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="bg-brand-600 hover:bg-brand-700 inline-flex h-10 items-center gap-1.5 rounded-md px-4 text-sm font-medium text-white shadow-sm transition-colors"
          >
            <Save className="h-4 w-4" />
            Save profile
          </button>
        </div>
      </form>
    </main>
  );
}
