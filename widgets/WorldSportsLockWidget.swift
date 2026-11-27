import WidgetKit
import SwiftUI

struct MatchWidgetData: Codable {
    let matchId: String
    let title: String
    let sport: String
    let city: String
    let timeLabel: String
    let playersCount: Int
    let maxPlayers: Int?
    let joinedCode: String?
}

struct MatchEntry: TimelineEntry {
    let date: Date
    let match: MatchWidgetData?
}

struct MatchProvider: TimelineProvider {
    private let appGroupId = "group.com.naor823.WorldSports"
    private let storageKey = "world_sports_active_lock_match"

    func placeholder(in context: Context) -> MatchEntry {
        MatchEntry(
            date: Date(),
            match: MatchWidgetData(
                matchId: "demo",
                title: "Evening Match",
                sport: "Football",
                city: "Current Location",
                timeLabel: "19:30",
                playersCount: 8,
                maxPlayers: 10,
                joinedCode: "WS402"
            )
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (MatchEntry) -> Void) {
        completion(MatchEntry(date: Date(), match: loadMatch()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<MatchEntry>) -> Void) {
        let currentMatch = loadMatch()
        let entry = MatchEntry(date: Date(), match: currentMatch)
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 15, to: Date()) ?? Date().addingTimeInterval(900)
        completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
    }

    private func loadMatch() -> MatchWidgetData? {
        guard let defaults = UserDefaults(suiteName: appGroupId),
              let rawString = defaults.string(forKey: storageKey),
              let data = rawString.data(using: .utf8) else {
            return nil
        }
        return try? JSONDecoder().decode(MatchWidgetData.self, from: data)
    }
}

struct LockScreenMatchView: View {
    var entry: MatchEntry

    var body: some View {
        if let match = entry.match {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 4) {
                    Image(systemName: "sportscourt.fill")
                        .font(.caption2)
                    Text(match.sport.uppercased())
                        .font(.caption2)
                        .fontWeight(.black)
                    Spacer()
                    Text(match.timeLabel)
                        .font(.caption2)
                        .fontWeight(.bold)
                }

                Text(match.title)
                    .font(.headline)
                    .fontWeight(.bold)
                    .lineLimit(1)

                HStack(spacing: 6) {
                    Text(match.city)
                    Text("•")
                    if let maxP = match.maxPlayers {
                        Text("\(match.playersCount)/\(maxP) players")
                    } else {
                        Text("\(match.playersCount) players")
                    }
                }
                .font(.caption)
            }
            .widgetURL(URL(string: "worldsports://radar?matchId=\(match.matchId)"))
        } else {
            VStack(alignment: .leading, spacing: 2) {
                Text("WORLD SPORTS")
                    .font(.caption2)
                    .fontWeight(.black)
                Text("No active radar match")
                    .font(.subheadline)
                    .fontWeight(.semibold)
                Text("Join a match in Radar")
                    .font(.caption)
            }
            .widgetURL(URL(string: "worldsports://radar"))
        }
    }
}

@main
struct WorldSportsLockWidget: Widget {
    let kind: String = "WorldSportsLockWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: MatchProvider()) { entry in
            LockScreenMatchView(entry: entry)
        }
        .configurationDisplayName("Joined Radar Match")
        .description("Shows the match you joined in Radar on your lock screen.")
        .supportedFamilies([.accessoryRectangular])
    }
}