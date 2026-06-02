"use client";

import { useEffect, useState } from "react";
import MemojiAvatars from "@/components/MemojiAvatars";

// Distinct, readable trust module (large type for an older audience). The live
// "checking now" counter shows only when there's no V2 ticker (avoids two live
// elements competing). Initial value fixed so SSR == first client render.
export default function SocialProof({ stateName, showLiveCount = true }: { stateName?: string; showLiveCount?: boolean }) {
  const [live, setLive] = useState(4);

  useEffect(() => {
    const id = setInterval(() => {
      setLive((n) => Math.max(2, Math.min(9, n + (Math.random() < 0.5 ? -1 : 1))));
    }, 4200);
    return () => clearInterval(id);
  }, []);

  const where = stateName ? `in ${stateName}` : "nationwide";
  return (
    <div className="trust">
      <div className="trust-top">
        <MemojiAvatars />
        <div className="trust-stats"><b>12,418</b> people checked this month</div>
      </div>
      <div className="trust-bot">
        <span><b>$48M+</b> recovered for clients</span>
        {showLiveCount && (
          <>
            <span className="trust-sep" aria-hidden="true" />
            <span className="trust-live"><i />{live} checking {where} now</span>
          </>
        )}
      </div>
    </div>
  );
}
