export async function addFavoriteForUser(userId, opportunityId, supabaseClient) {
  const { data, error } = await supabaseClient
    .from("favorites")
    .insert({
      user_id: userId,
      opportunity_id: opportunityId,
    })
    .select("id")
    .single();

  if (error) {
    return { error, data: null };
  }

  return { error: null, data };
}

export async function removeFavoriteForUser(userId, opportunityId, supabaseClient) {
  const { data, error } = await supabaseClient
    .from("favorites")
    .delete()
    .eq("user_id", userId)
    .eq("opportunity_id", opportunityId);

  if (error) {
    return { error, data: null };
  }

  return { error: null, data };
}

export async function listFavoritesForUser(userId, supabaseClient) {
  const { data, error } = await supabaseClient
    .from("favorites")
    .select("id, opportunity_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    return { error, data: null };
  }

  return { error: null, data };
}