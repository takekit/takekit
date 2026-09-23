import type { ReactNode } from "react";
import { Clapperboard } from "lucide-react";

/** Empty-thread landing: one question, the composer right under it. */
export function Hero({ project, children }: { project: string | null; children: ReactNode }) {
  return (
    <div className="hero">
      <div className="hero-inner">
        <Clapperboard className="hero-mark" size={30} strokeWidth={1.25} aria-hidden />
        <h1 className="hero-title">
          {project ? (
            <>
              O que vamos editar em <span className="hero-project">{project}</span>?
            </>
          ) : (
            "O que vamos editar hoje?"
          )}
        </h1>
        {children}
      </div>
    </div>
  );
}
