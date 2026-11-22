import { redirect } from "next/navigation";

// L'ancienne page Fans n'existe plus : tout se fait depuis la messagerie.
export default function FansPage() {
  redirect("/app/messagerie");
}
