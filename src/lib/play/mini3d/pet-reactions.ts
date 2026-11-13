type PetPose = "idle" | "relaxed" | "resisting" | "leaving";

interface PetReaction {
  pose: PetPose;
  gentleTime: number;
  sinceFavorite: number;
}

export function newPetReaction(): PetReaction {
  return { pose: "idle", gentleTime: 0, sinceFavorite: 0 };
}

export function petReaction(current: PetReaction, {
  dt = 0, annoyance = 0, favoriteStroke = false, ran = false,
}: { dt?: number; annoyance?: number; favoriteStroke?: boolean; ran?: boolean }): PetReaction {
  if (current.pose === "leaving" || ran) return { ...current, pose: "leaving" };
  if (annoyance >= (current.pose === "resisting" ? 36 : 55)) {
    return { pose: "resisting", gentleTime: 0, sinceFavorite: 0 };
  }

  const sinceFavorite = favoriteStroke ? 0 : current.sinceFavorite + dt;
  const gentleTime = favoriteStroke
    ? current.gentleTime + Math.min(dt, 0.1)
    : sinceFavorite > 0.32 ? 0 : current.gentleTime;
  return { pose: gentleTime >= 0.28 ? "relaxed" : "idle", gentleTime, sinceFavorite };
}
