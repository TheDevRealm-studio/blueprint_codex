export interface PageTemplate {
  id: string;
  name: string;
  description: string;
  markdown: string;
  tags?: string[];
}

export const templates: PageTemplate[] = [
  {
    id: 'blank',
    name: 'Blank Page',
    description: 'Start from scratch',
    markdown: ''
  },
  {
    id: 'actor',
    name: 'Actor Class',
    description: 'Standard documentation for a Blueprint Actor',
    tags: ['Actor', 'Blueprint'],
    markdown: `# Actor Name

## Overview
Brief description of what this actor does.

## Components
| Component | Type | Description |
|-----------|------|-------------|
| Root | SceneComponent | Root of the actor |
| Mesh | StaticMesh | Visual representation |

## Variables
- **IsActive** (Boolean): Controls state
- **Health** (Float): Current health

## Functions
### BeginPlay
Initialization logic.

### Tick
Frame updates.

## Replication
- [ ] Replicates Movement
- [ ] Replicates Variables
`
  },
  {
    id: 'gamemode',
    name: 'Game Mode',
    description: 'Rules and flow of the game',
    tags: ['GameMode', 'Framework'],
    markdown: `# Game Mode Name

## Rules
1. Rule 1
2. Rule 2

## Player Controllers
- **Default Pawn Class**: 
- **HUD Class**: 
- **Player Controller Class**: 

## Game States
- **WaitingToStart**:
- **InProgress**:
- **GameOver**:
`
  },
  {
    id: 'network',
    name: 'Network Protocol',
    description: 'Documentation for network systems',
    tags: ['Network', 'Replication'],
    markdown: `# System Name

## Replication Strategy
- **Reliable**: Critical gameplay events
- **Unreliable**: Cosmetic updates

## RPCs (Remote Procedure Calls)
| Function | Type | Reliability | Description |
|----------|------|-------------|-------------|
| ServerFire | Server | Reliable | Request to fire weapon |
| ClientHit | Client | Unreliable | Show hit marker |

## Bandwidth Considerations
Estimated bandwidth usage per client: ~X KB/s
`
  }
];
