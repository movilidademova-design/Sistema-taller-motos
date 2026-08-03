import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PhotosService } from './photos.service';
import { PhotoStage } from '../../generated/prisma/enums';

function makeService(photo: { id: string; stage: PhotoStage } | null) {
  const del = jest.fn().mockResolvedValue({});
  const create = jest.fn().mockResolvedValue({});
  const service = new PhotosService(
    {
      orderPhoto: {
        findFirst: jest.fn().mockResolvedValue(photo),
        delete: del,
        create,
      },
    } as never,
    { upload: jest.fn().mockResolvedValue('/uploads/x.png') } as never,
    { assertOrderExists: jest.fn().mockResolvedValue({}) } as never,
  );
  return { service, del, create };
}

describe('PhotosService.remove', () => {
  it('refuses to delete an intake photo', async () => {
    const { service, del } = makeService({
      id: 'p1',
      stage: PhotoStage.INTAKE,
    });

    await expect(service.remove('t1', 'o1', 'p1')).rejects.toThrow(
      BadRequestException,
    );
    expect(del).not.toHaveBeenCalled();
  });

  it('deletes a work photo', async () => {
    const { service, del } = makeService({ id: 'p1', stage: PhotoStage.WORK });

    await service.remove('t1', 'o1', 'p1');
    expect(del).toHaveBeenCalledWith({ where: { id: 'p1' } });
  });

  it('404s when the photo does not belong to the order', async () => {
    const { service, del } = makeService(null);

    await expect(service.remove('t1', 'o1', 'p1')).rejects.toThrow(
      NotFoundException,
    );
    expect(del).not.toHaveBeenCalled();
  });
});

describe('PhotosService.upload', () => {
  it('always stores uploads as work evidence, never as intake', async () => {
    const { service, create } = makeService(null);

    await service.upload('t1', 'o1', undefined, {
      buffer: Buffer.from(''),
      originalname: 'x.png',
      mimetype: 'image/png',
    } as Express.Multer.File);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        // Nested expect.objectContaining() inside an object literal loses its type here.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({ stage: PhotoStage.WORK }),
      }),
    );
  });
});
