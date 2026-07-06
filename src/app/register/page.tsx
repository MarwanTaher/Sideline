import { redirect } from "next/navigation";
import { auth } from "@/auth";
import RegisterForm from "./register-form";

export const metadata = {
  title: "Request to join · Sideline",
};

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/");
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <RegisterForm />
    </main>
  );
}
