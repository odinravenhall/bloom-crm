import type { Metadata } from "next";
import { MessagesPro } from "./MessagesPro";

export const metadata: Metadata = { title: "Creator list" };

export default function MessagesProPage() {
  return <MessagesPro />;
}
