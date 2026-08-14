package images

import (
	"strings"

	"github.com/distribution/reference"
	dockerconfig "github.com/docker/cli/cli/config"
	"github.com/moby/moby/api/pkg/authconfig"
	"github.com/moby/moby/api/types/registry"
)

func registryAuthBase64(imageRef string) string {
	host := registryHost(imageRef)
	if host == "" {
		return ""
	}
	cfg, err := dockerconfig.Load(dockerconfig.Dir())
	if err != nil {
		return ""
	}
	ac, err := cfg.GetAuthConfig(host)
	if err != nil {
		return ""
	}
	if ac.Username == "" && ac.Password == "" && ac.IdentityToken == "" && ac.Auth == "" {
		return ""
	}
	encoded, err := authconfig.Encode(registry.AuthConfig{
		Username:      ac.Username,
		Password:      ac.Password,
		Auth:          ac.Auth,
		ServerAddress: ac.ServerAddress,
		IdentityToken: ac.IdentityToken,
		RegistryToken: ac.RegistryToken,
	})
	if err != nil {
		return ""
	}
	return encoded
}

func registryHost(imageRef string) string {
	named, err := reference.ParseNormalizedNamed(imageRef)
	if err != nil {
		ref := strings.TrimSpace(imageRef)
		if i := strings.IndexByte(ref, '/'); i > 0 && strings.Contains(ref[:i], ".") {
			return ref[:i]
		}
		return "docker.io"
	}
	return reference.Domain(named)
}
