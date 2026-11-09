using System.Text.Json;
using System.Text.Json.Serialization;
using SPTarkov.DI.Annotations;
using SPTarkov.Server.Core.Callbacks;
using SPTarkov.Server.Core.DI;
using SPTarkov.Server.Core.Helpers.Server;
using SPTarkov.Server.Core.Models.Common;
using SPTarkov.Server.Core.Models.Eft.Common;
using SPTarkov.Server.Core.Models.Eft.Inventory;
using SPTarkov.Server.Core.Models.Eft.ItemEvent;
using SPTarkov.Server.Core.Models.Eft.Ragfair;
using SPTarkov.Server.Core.Models.Eft.Trade;
using SPTarkov.Server.Core.Models.Utils;
using SPTarkov.Server.Core.Servers;
using SPTarkov.Server.Core.Utils;

namespace SptMarketConnector;

[Injectable]
public sealed class SptMarketApiRouter : StaticRouter
{
    public SptMarketApiRouter(
        JsonUtil json,
        SaveServer saves,
        RagfairCallbacks ragfair,
        TradeCallbacks trades,
        InventoryCallbacks inventory)
        : base(json, BuildRoutes(json, saves, ragfair, trades, inventory))
    {
    }

    private static RouteAction[] BuildRoutes(
        JsonUtil json,
        SaveServer saves,
        RagfairCallbacks ragfair,
        TradeCallbacks trades,
        InventoryCallbacks inventory)
    {
        return
        [
            new RouteAction<EmptyRequestData>(
                "/spt-market/status",
                (url, request, sessionId, output, cancellationToken) =>
                new ValueTask<string>(Serialize(json, new
                    {
                        connector = "spt-market",
                        protocol = 1,
                        capabilities = new[]
                        {
                            "flea.search",
                            "flea.price",
                            "flea.offer.create",
                            "flea.offer.remove",
                            "flea.offer.extend",
                            "flea.offer.find",
                            "flea.buy",
                            "trader.trade",
                            "stash.move"
                        }
                    }))),
            new RouteAction<SearchRequestData>(
                "/spt-market/ragfair/search",
                async (url, request, sessionId, output, cancellationToken) =>
                {
                    RequireProfile(saves, sessionId);
                    return await ragfair.Search(url, request, sessionId);
                }),
            new RouteAction<GetMarketPriceRequestData>(
                "/spt-market/ragfair/price",
                async (url, request, sessionId, output, cancellationToken) =>
                {
                    RequireProfile(saves, sessionId);
                    return await ragfair.GetMarketPrice(url, request, sessionId);
                }),
            new RouteAction<EmptyRequestData>(
                "/spt-market/ragfair/prices",
                async (url, request, sessionId, output, cancellationToken) =>
                {
                    RequireProfile(saves, sessionId);
                    return await ragfair.GetFleaPrices(url, request, sessionId);
                }),
            new RouteAction<GetRagfairOfferByIdRequest>(
                "/spt-market/ragfair/find-by-id",
                async (url, request, sessionId, output, cancellationToken) =>
                {
                    RequireProfile(saves, sessionId);
                    return await ragfair.GetFleaOfferById(url, request, sessionId);
                }),
            new RouteAction(
                "/spt-market/ragfair/offer/create",
                async (url, request, sessionId, output, cancellationToken) =>
                {
                    var pmc = RequireProfile(saves, sessionId);
                    var payload = DeserializePayload<AddOfferRequestData>(json, request);
                    return Serialize(json, await ragfair.AddOffer(pmc, payload, sessionId));
                },
                typeof(MarketPayloadRequestData)),
            new RouteAction(
                "/spt-market/ragfair/offer/remove",
                async (url, request, sessionId, output, cancellationToken) =>
                {
                    var pmc = RequireProfile(saves, sessionId);
                    var payload = DeserializePayload<RemoveOfferRequestData>(json, request);
                    return Serialize(json, await ragfair.RemoveOffer(pmc, payload, sessionId));
                },
                typeof(MarketPayloadRequestData)),
            new RouteAction(
                "/spt-market/ragfair/offer/extend",
                async (url, request, sessionId, output, cancellationToken) =>
                {
                    var pmc = RequireProfile(saves, sessionId);
                    var payload = DeserializePayload<ExtendOfferRequestData>(json, request);
                    return Serialize(json, await ragfair.ExtendOffer(pmc, payload, sessionId));
                },
                typeof(MarketPayloadRequestData)),
            new RouteAction(
                "/spt-market/ragfair/buy",
                async (url, request, sessionId, output, cancellationToken) =>
                {
                    var pmc = RequireProfile(saves, sessionId);
                    var payload = DeserializePayload<ProcessRagfairTradeRequestData>(json, request);
                    return Serialize(json, await trades.ProcessRagfairTrade(pmc, payload, sessionId));
                },
                typeof(MarketPayloadRequestData)),
            new RouteAction(
                "/spt-market/traders/trade",
                async (url, request, sessionId, output, cancellationToken) =>
                {
                    var pmc = RequireProfile(saves, sessionId);
                    var payload = DeserializePayload<ProcessBaseTradeRequestData>(json, request);
                    return Serialize(json, await trades.ProcessTrade(pmc, payload, sessionId));
                },
                typeof(MarketPayloadRequestData)),
            new RouteAction(
                "/spt-market/stash/move",
                async (url, request, sessionId, output, cancellationToken) =>
                {
                    var pmc = RequireProfile(saves, sessionId);
                    var payload = DeserializePayload<InventoryMoveRequestData>(json, request);
                    var response = new ItemEventRouterResponse();
                    var result = await inventory.MoveItem(pmc, payload, sessionId, response);
                    var serialized = Serialize(json, result);
                    if (!HasWarnings(serialized))
                    {
                        await saves.SaveProfileAsync(sessionId, cancellationToken);
                    }

                    return serialized;
                },
                typeof(MarketPayloadRequestData))
        ];
    }

    private static bool HasWarnings(string response)
    {
        using var document = JsonDocument.Parse(response);
        var warningsProperty = document.RootElement.ValueKind == JsonValueKind.Object
            ? document.RootElement.EnumerateObject()
                .FirstOrDefault(property => string.Equals(property.Name, "warnings", StringComparison.OrdinalIgnoreCase))
            : default;
        if (warningsProperty.Value.ValueKind == JsonValueKind.Undefined)
        {
            return false;
        }

        return warningsProperty.Value.ValueKind switch
        {
            JsonValueKind.Array => warningsProperty.Value.GetArrayLength() > 0,
            JsonValueKind.Object => warningsProperty.Value.EnumerateObject().Any(),
            JsonValueKind.String => !string.IsNullOrWhiteSpace(warningsProperty.Value.GetString()),
            JsonValueKind.True => true,
            _ => false
        };
    }

    private static T DeserializePayload<T>(JsonUtil json, IRequestData request)
        where T : class
    {
        var payload = (request as MarketPayloadRequestData)?.Properties
            ?? throw new InvalidOperationException("The market request payload is missing.");
        var serialized = json.Serialize(payload)
            ?? throw new InvalidOperationException("The market request payload could not be serialized.");

        return json.Deserialize(serialized, typeof(T)) as T
            ?? throw new InvalidOperationException("The market request payload has an invalid shape.");
    }

    private static string Serialize(JsonUtil json, object response) =>
        json.Serialize(response)
        ?? throw new InvalidOperationException("The SPT response could not be serialized.");

    private static PmcData RequireProfile(SaveServer saves, MongoId sessionId)
    {
        if (sessionId.IsEmpty || !saves.ProfileExists(sessionId))
        {
            throw new UnauthorizedAccessException("An authenticated SPT profile is required.");
        }

        var profile = saves.GetProfile(sessionId)
            ?? throw new InvalidOperationException("The selected SPT profile could not be loaded.");

        return profile.CharacterData?.PmcData
            ?? throw new InvalidOperationException("The selected SPT profile does not contain a PMC.");
    }

    private sealed class MarketPayloadRequestData : IRequestData
    {
        [JsonExtensionData]
        public Dictionary<string, JsonElement> Properties { get; set; } = [];
    }
}
