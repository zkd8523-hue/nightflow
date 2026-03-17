import { redirect } from "next/navigation";

export default function MyWinsPage() {
    redirect("/bids?tab=won");
}
