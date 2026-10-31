import { useCallback, useState } from "react";
import {
  ActivityIndicator, FlatList, Pressable, RefreshControl, SafeAreaView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";

/**
 * Recura mobile: staff sign in and get the supply shopping list to use in the store.
 * On a physical phone, set expo.extra.apiUrl in app.json to your computer's LAN address.
 */
const API = (Constants.expoConfig?.extra?.apiUrl as string) ?? "http://localhost:3000";

interface ShopItem {
  id: string;
  name: string;
  supplier: string;
  location: string;
  have: number;
  buy: number;
  unit: string;
  estCost: number;
  reason: string;
}

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [items, setItems] = useState<ShopItem[]>([]);
  const [total, setTotal] = useState(0);
  const [bought, setBought] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (t: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/supplies/shopping-list`, { headers: { Authorization: `Bearer ${t}` } });
      if (!res.ok) throw new Error(`Couldn't load the list (${res.status})`);
      const data = await res.json();
      setItems(data.items);
      setTotal(data.total);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  async function signIn() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sign in failed");
      if (data.user.portal !== "staff") throw new Error("The shopping list is for clinic staff accounts");
      setToken(data.token);
      await load(data.token);
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <SafeAreaView style={s.screen}>
        <StatusBar style="auto" />
        <View style={s.card}>
          <Text style={s.title}>Recura</Text>
          <Text style={s.muted}>Staff sign in for the supply shopping list</Text>
          <TextInput style={s.input} placeholder="Username" autoCapitalize="none" value={username} onChangeText={setUsername} accessibilityLabel="Username" />
          <TextInput style={s.input} placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} accessibilityLabel="Password" />
          {error && <Text style={s.error}>{error}</Text>}
          <Pressable style={s.button} onPress={signIn} accessibilityRole="button" disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Sign in</Text>}
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.screen}>
      <StatusBar style="auto" />
      <View style={s.header}>
        <Text style={s.title}>Shopping list</Text>
        <Text style={s.muted}>
          {items.length - bought.size} left · est. ${total.toFixed(2)}
        </Text>
      </View>
      {error && <Text style={s.error}>{error}</Text>}
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(token)} />}
        ListEmptyComponent={!loading ? <Text style={s.muted}>Nothing to reorder right now.</Text> : null}
        renderItem={({ item }) => {
          const done = bought.has(item.id);
          return (
            <Pressable
              style={[s.row, done && s.rowDone]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: done }}
              onPress={() => {
                const next = new Set(bought);
                done ? next.delete(item.id) : next.add(item.id);
                setBought(next);
              }}
            >
              <View style={[s.box, done && s.boxDone]}>{done && <Text style={s.tick}>✓</Text>}</View>
              <View style={{ flex: 1 }}>
                <Text style={[s.itemName, done && s.strike]}>
                  {item.buy} {item.unit} · {item.name}
                </Text>
                <Text style={s.muted}>
                  {item.supplier} · {item.reason}
                </Text>
              </View>
              <Text style={s.cost}>${item.estCost.toFixed(2)}</Text>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f4f7f6", padding: 16 },
  card: { marginTop: 80, backgroundColor: "#fff", borderRadius: 16, padding: 20, gap: 12 },
  header: { marginVertical: 12 },
  title: { fontSize: 26, fontWeight: "800", color: "#13201f" },
  muted: { color: "#5a6b69", fontSize: 14 },
  input: { borderWidth: 1, borderColor: "#d6e0de", borderRadius: 8, padding: 12, fontSize: 16, backgroundColor: "#fff" },
  button: { backgroundColor: "#0f766e", padding: 14, borderRadius: 8, alignItems: "center", minHeight: 48 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  error: { color: "#b91c1c", marginVertical: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff", padding: 14, borderRadius: 12, marginBottom: 8, minHeight: 56 },
  rowDone: { opacity: 0.55 },
  box: { width: 26, height: 26, borderRadius: 6, borderWidth: 2, borderColor: "#0f766e", alignItems: "center", justifyContent: "center" },
  boxDone: { backgroundColor: "#0f766e" },
  tick: { color: "#fff", fontWeight: "800" },
  itemName: { fontSize: 16, fontWeight: "600", color: "#13201f" },
  strike: { textDecorationLine: "line-through" },
  cost: { fontWeight: "700", fontVariant: ["tabular-nums"], color: "#13201f" },
});
