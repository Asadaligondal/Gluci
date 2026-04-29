package app.gluci.mvp.data

import com.google.gson.JsonElement

fun JsonElement?.parseGlucoseCurve(): List<GluciCurvePoint>? {
    val root = this ?: return null
    if (!root.isJsonArray) return null
    val list = mutableListOf<GluciCurvePoint>()
    for (el in root.asJsonArray) {
        if (!el.isJsonObject) continue
        val o = el.asJsonObject
        val minute = o.get("minute")?.takeIf { !it.isJsonNull }?.asInt ?: continue
        val mg = o.get("mg_dl")?.takeIf { !it.isJsonNull }?.asDouble ?: continue
        list.add(GluciCurvePoint(minute, mg))
    }
    return list.takeIf { it.isNotEmpty() }
}
