import { Suspense } from "react";
import Device from "@/components/Device";

export const metadata = { title: "Display · Storefront in a Box" };

export default function DevicePage() {
  return (
    <Suspense>
      <Device />
    </Suspense>
  );
}
