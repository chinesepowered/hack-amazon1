import Kitchen from "@/components/Kitchen";

export const metadata = { title: "Kitchen screen · Storefront in a Box" };

export default async function MerchantPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <Kitchen slug={slug} />;
}
