/* Escolhe de onde vêm os dados: com firebase-config.js preenchido, usa o Firebase de verdade (com login da barraca);
   sem ele, abre o modo demonstração, que roda inteiro no navegador com dados de exemplo. */
import { firebaseConfig } from "./firebase-config.js";

export async function iniciarBanco(){
  const temFirebase=!!(firebaseConfig&&firebaseConfig.apiKey&&!/COLE/.test(firebaseConfig.apiKey));
  if(temFirebase){const { conectarFirebase }=await import("./banco-firebase.js");return conectarFirebase(firebaseConfig)}
  const { conectarDemo }=await import("./banco-demo.js");return conectarDemo();
}
