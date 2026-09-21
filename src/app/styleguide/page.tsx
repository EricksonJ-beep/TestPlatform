import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const metadata: Metadata = { title: "Style guide" };

const swatches = [
  { name: "Brand teal", token: "bg-brand", hex: "#0E7C7B", text: "text-white" },
  { name: "Teal deep", token: "bg-brand-deep", hex: "#0A6261", text: "text-white" },
  { name: "Teal soft", token: "bg-brand-soft", hex: "#E4F1F0", text: "text-brand-deep" },
  { name: "Action coral", token: "bg-coral", hex: "#FF6B5C", text: "text-white" },
  { name: "Coral (buttons)", token: "bg-coral-deep", hex: "#E2553A", text: "text-white" },
  { name: "Success", token: "bg-success", hex: "#2E9E5B", text: "text-white" },
  { name: "Warning", token: "bg-warning", hex: "#F4A300", text: "text-foreground" },
  { name: "Error", token: "bg-error", hex: "#E5484D", text: "text-white" },
  { name: "Text", token: "bg-foreground", hex: "#1A1A1A", text: "text-white" },
  { name: "Muted text", token: "bg-muted-foreground", hex: "#5C6670", text: "text-white" },
  { name: "Page bg", token: "bg-background", hex: "#F7F8F9", text: "text-foreground" },
  { name: "Card", token: "bg-card", hex: "#FFFFFF", text: "text-foreground" },
];

const pills = [
  { label: "Not started", className: "bg-muted text-muted-foreground" },
  { label: "In progress", className: "bg-brand-soft text-brand-deep" },
  { label: "Corrections needed", className: "bg-coral-soft text-[#B93E27]" },
  { label: "Retake required", className: "bg-coral-soft text-[#B93E27]" },
  { label: "Done", className: "bg-success-soft text-success-foreground" },
  { label: "AI flag", className: "bg-warning-soft text-warning-foreground" },
  { label: "Returned", className: "bg-error-soft text-error-foreground" },
];

export default function StyleguidePage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-10">
      <header className="mb-10">
        <p className="text-brand-deep text-xs font-medium tracking-wide uppercase">Bloom</p>
        <h1 className="mt-1 text-3xl">Style guide</h1>
        <p className="text-muted-foreground mt-2 max-w-prose">
          The tokens from PLAN.md §5 as they render through Tailwind and shadcn. Teal carries
          structure and selection, coral is reserved for the one action that matters, and green,
          amber, and red are status only.
        </p>
      </header>

      <Section title="Color">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {swatches.map((s) => (
            <div key={s.name} className="border-border overflow-hidden rounded-lg border">
              <div className={`${s.token} ${s.text} flex h-20 items-end p-3 text-xs font-medium`}>
                {s.hex}
              </div>
              <div className="bg-card px-3 py-2 text-sm">{s.name}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Type">
        <div className="bg-card border-border space-y-4 rounded-lg border p-6">
          <h1 className="text-3xl">Heading 1 · Lexend 600</h1>
          <h2 className="text-2xl">Heading 2 · Unit 2 Test · Cell transport</h2>
          <h3 className="text-lg">Heading 3 · Needed before your retake</h3>
          <p className="max-w-prose text-[15px] leading-relaxed">
            Body · Inter 400 at 15px for question stems. A red blood cell is placed in a beaker of
            solution. Which best describes the solution in the beaker?
          </p>
          <p className="text-muted-foreground max-w-prose text-sm">
            Muted · Inter 400 at 14px. Attempt 1: 37/40 · retake window closes Fri Oct 16
          </p>
          <p className="tabular text-sm">
            Tabular numerals: 1,284 questions · 23:41 · 92.5%
          </p>
        </div>
      </Section>

      <Section title="Buttons">
        <div className="bg-card border-border flex flex-wrap items-center gap-3 rounded-lg border p-6">
          <Button>Start retake</Button>
          <Button variant="secondary">Resume</Button>
          <Button variant="outline">Previous</Button>
          <Button variant="ghost">See results</Button>
          <Button variant="destructive">Remove student</Button>
          <Button variant="link">All results</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
          <Button disabled>Disabled</Button>
        </div>
      </Section>

      <Section title="Badges and status pills">
        <div className="bg-card border-border space-y-4 rounded-lg border p-6">
          <div className="flex flex-wrap gap-2">
            <Badge>Summative</Badge>
            <Badge variant="secondary">Formative</Badge>
            <Badge variant="outline">Practice</Badge>
            <Badge variant="destructive">Overdue</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            {pills.map((p) => (
              <Badge key={p.label} className={p.className}>
                {p.label}
              </Badge>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="bg-brand-soft text-brand-deep inline-flex h-6 items-center rounded-md px-2 text-xs font-medium">
              LT2 · Diffusion &amp; osmosis
            </span>
            <span className="bg-coral-soft inline-flex h-6 items-center rounded-md px-2 text-xs font-medium text-[#B93E27]">
              LT4 · 70% · required
            </span>
            <span className="bg-muted text-muted-foreground inline-flex h-6 items-center rounded-md px-2 text-xs font-medium">
              LT3 · 90% · optional
            </span>
          </div>
        </div>
      </Section>

      <Section title="Card, inputs, tabs">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Add a student</CardTitle>
              <CardDescription>They log in with their Cadott Google email.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="sg-first">First name</Label>
                <Input id="sg-first" placeholder="Maya" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sg-email">Email</Label>
                <Input id="sg-email" type="email" placeholder="maya.rivera@cadott.k12.wi.us" />
              </div>
            </CardContent>
            <CardFooter className="gap-2">
              <Button>Add student</Button>
              <Button variant="ghost">Cancel</Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Student home tabs</CardTitle>
              <CardDescription>Assignments · Practice · My results</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="assignments">
                <TabsList>
                  <TabsTrigger value="assignments">Assignments</TabsTrigger>
                  <TabsTrigger value="practice">Practice</TabsTrigger>
                  <TabsTrigger value="results">My results</TabsTrigger>
                </TabsList>
                <TabsContent value="assignments" className="text-muted-foreground pt-3 text-sm">
                  Nothing assigned yet. When your teacher opens a quiz or test, it shows up here.
                </TabsContent>
                <TabsContent value="practice" className="text-muted-foreground pt-3 text-sm">
                  Practice is always open and never graded.
                </TabsContent>
                <TabsContent value="results" className="text-muted-foreground pt-3 text-sm">
                  Your highest score always counts.
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-lg">{title}</h2>
      {children}
    </section>
  );
}
