function startProSync() {
  setInterval(async () => {
    const { data } = await supabase
      .from("users")
      .select("pro")
      .eq("id", state.userId)
      .single();

    if (data?.pro && !state.isPro) {
      state.isPro = true;

      showSystemMessage("Depy completo desbloqueado.");
    }
  }, 4000); // verifica a cada 4 segundos
}
