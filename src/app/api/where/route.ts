import { NextResponse } from "next/server";
import { placeFromGeo } from "@/lib/geo/visitor-city";

// 只讀主機代轉的 IP 縣市（Vercel）。不向瀏覽器要 GPS，也不把 IP 存下來。
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const country = request.headers.get("x-vercel-ip-country");
  if (country && country !== "TW") return NextResponse.json({ city: null });
  const lat = Number(request.headers.get("x-vercel-ip-latitude"));
  const lng = Number(request.headers.get("x-vercel-ip-longitude"));
  const place = placeFromGeo({
    city: request.headers.get("x-vercel-ip-city"),
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
  });
  return NextResponse.json(place);
}
