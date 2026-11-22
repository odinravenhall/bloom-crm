import { redirect } from "next/navigation";

// OF Manager : on arrive sur « Home ».
export default function OfManagerIndex() {
  redirect("/app/of-manager/home");
}
