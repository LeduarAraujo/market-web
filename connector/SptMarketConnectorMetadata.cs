using SPTarkov.Server.Core.Models.Spt.Mod;
using SemVersion = SemanticVersioning.Version;
using VersionRange = SemanticVersioning.Range;

namespace SptMarketConnector;

public sealed class SptMarketConnectorMetadata : IModMetadata
{
    public string ModGuid { get; init; } = "com.spt.marketweb.connector";
    public string Name { get; init; } = "SPT Market Connector";
    public string Author { get; init; } = "SPT Market Web";
    public List<string>? Contributors { get; init; }
    public SemVersion Version { get; init; } = new("1.0.0");
    public VersionRange SptVersion { get; init; } = new("~4.1.0");
    public bool HasPrepatcher { get; init; }
    public List<string>? Incompatibilities { get; init; }
    public Dictionary<string, VersionRange>? ModDependencies { get; init; }
    public string? Url { get; init; }
    public string License { get; init; } = "UNLICENSED";
}
