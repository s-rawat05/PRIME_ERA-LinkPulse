import { ButtonLink } from "@/components/ui/primitives";
import { LogoMark } from "@/components/brand";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-4">
      <div className="max-w-md text-center">
        <LogoMark className="mx-auto mb-6 size-14" />
        <p className="font-mono text-sm text-pulse-600">404</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">Page not found</h1>
        <p className="mt-2 text-sm text-ink-soft">The page you are looking for does not exist or you do not have access to it.</p>
        <ButtonLink href="/" className="mt-6">
          Back to LinkPulse
        </ButtonLink>
      </div>
    </main>
  );
}
