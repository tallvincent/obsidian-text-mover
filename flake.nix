{
  description = "Development environment for the Obsidian text mover plugin";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];

      forAllSystems = nixpkgs.lib.genAttrs systems;
    in
    {
      devShells = forAllSystems (system:
        let
          pkgs = import nixpkgs { inherit system; };
        in
        {
          default = pkgs.mkShell {
            packages = with pkgs; [
              # JavaScript / TypeScript development
              nodejs_22
              typescript-language-server
              vscode-langservers-extracted
              eslint
              prettier

              # Nix development
              nil
              statix
              nixfmt
            ];
          };
        });
    };
}
